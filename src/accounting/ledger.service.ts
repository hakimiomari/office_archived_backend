import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantCreate } from "../tenant/tenant-create";
import { ChartOfAccountsService, ACCOUNT_CODES } from "./chart-of-accounts.service";

/**
 * Double-entry posting service. Every journal entry is validated to
 * balance (Σ debits === Σ credits, within a tiny rounding tolerance)
 * BEFORE the insert. An unbalanced entry is a programming bug — never
 * something to log and continue.
 *
 * The four post* methods correspond to the four event-driven posting
 * rules from §3.1 (sale.created, payment.received,
 * supplier_payment.received, purchase.received). Each is wrapped in a
 * single transaction so the entry + its lines either both commit or
 * neither does.
 *
 * Idempotency: each post takes a `sourceType` + `sourceId` pair (e.g.
 * SALE + saleId). Before inserting we check whether an entry already
 * exists for that source — if so, we skip. That keeps event replays
 * (or producer retries) from double-posting the same business event.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  /** 1 cent tolerance for floating-point rounding when validating Σ=0. */
  private static readonly BALANCE_EPSILON = 0.01;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chart: ChartOfAccountsService,
  ) {}

  /** Generate a per-tenant entry number like `JE-20260512-0001`. */
  private async generateEntryNo(): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const count = await this.prisma.journalEntry.count({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
    });
    return `JE-${datePart}-${String(count + 1).padStart(4, "0")}`;
  }

  /**
   * Core poster. Validates balance, looks up account ids by code,
   * generates an entry number, and writes the entry + lines in a single
   * transaction.
   *
   * Skips silently if an entry for the same `(sourceType, sourceId)`
   * already exists — that's the idempotency guarantee for events.
   */
  async post(args: {
    date: Date;
    description: string;
    sourceType: string;
    sourceId: number;
    lines: Array<{
      accountCode: string;
      debit?: number;
      credit?: number;
      description?: string;
    }>;
    createdBy?: string | null;
  }) {
    // Idempotency: a prior posting for this source short-circuits.
    const existing = await this.prisma.journalEntry.findFirst({
      where: { sourceType: args.sourceType, sourceId: args.sourceId },
      select: { id: true, entryNo: true },
    });
    if (existing) {
      this.logger.debug(
        `journal entry already posted for ${args.sourceType}#${args.sourceId} (entry ${existing.entryNo}); skipping`,
      );
      return existing;
    }

    // Resolve every account code to a row id. If any code is missing
    // (e.g. tenant never had its chart seeded), abort with a warning so
    // it shows up in logs / audit but doesn't blow up the producer.
    const codes = Array.from(new Set(args.lines.map((l) => l.accountCode)));
    const accounts = await this.prisma.account.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const codeToId = new Map(accounts.map((a) => [a.code, a.id]));
    const missing = codes.filter((c) => !codeToId.has(c));
    if (missing.length > 0) {
      this.logger.warn(
        `cannot post journal for ${args.sourceType}#${args.sourceId}: missing accounts [${missing.join(", ")}] (run /accounting/seed)`,
      );
      return null;
    }

    // Balance check.
    const lines = args.lines.map((l) => ({
      accountId: codeToId.get(l.accountCode)!,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      description: l.description ?? null,
    }));
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > LedgerService.BALANCE_EPSILON) {
      throw new BadRequestException(
        `Unbalanced journal entry: debits=${totalDebit} credits=${totalCredit} for ${args.sourceType}#${args.sourceId}`,
      );
    }

    const entryNo = await this.generateEntryNo();
    return this.prisma.journalEntry.create({
      data: tenantCreate<Prisma.JournalEntryUncheckedCreateInput>({
        entryNo,
        date: args.date,
        description: args.description,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        createdBy: args.createdBy ?? null,
        lines: {
          create: lines,
        },
      }),
      include: { lines: true },
    });
  }

  /**
   * Sale posting:
   *   DR Cash          paidAmount        (cash collected at point of sale)
   *   DR AR            remainingAmount   (outstanding customer credit)
   *   CR Revenue       totalAmount       (gross revenue)
   *
   * v1 omits tax/discount/COGS — to be added when those event payloads
   * carry the relevant amounts.
   */
  async postSale(args: {
    saleId: number;
    invoiceNo: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    saleDate: Date;
  }) {
    if (args.totalAmount <= 0) return null;
    const lines: Array<{
      accountCode: string;
      debit?: number;
      credit?: number;
      description?: string;
    }> = [
      {
        accountCode: ACCOUNT_CODES.SALES_REVENUE,
        credit: args.totalAmount,
        description: `Sale ${args.invoiceNo}`,
      },
    ];
    if (args.paidAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.CASH,
        debit: args.paidAmount,
        description: `Cash from sale ${args.invoiceNo}`,
      });
    }
    if (args.remainingAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        debit: args.remainingAmount,
        description: `AR for sale ${args.invoiceNo}`,
      });
    }
    return this.post({
      date: args.saleDate,
      description: `Sale ${args.invoiceNo}`,
      sourceType: "SALE",
      sourceId: args.saleId,
      lines,
    });
  }

  /**
   * Customer payment received against AR:
   *   DR Cash    amount
   *   CR AR      amount
   */
  async postPaymentReceived(args: {
    paymentId: number;
    amount: number;
    paymentDate: Date;
  }) {
    if (args.amount <= 0) return null;
    return this.post({
      date: args.paymentDate,
      description: `Payment received #${args.paymentId}`,
      sourceType: "PAYMENT",
      sourceId: args.paymentId,
      lines: [
        { accountCode: ACCOUNT_CODES.CASH, debit: args.amount },
        { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit: args.amount },
      ],
    });
  }

  /**
   * Supplier payment going out:
   *   DR AP     amount
   *   CR Cash   amount
   */
  async postSupplierPayment(args: {
    paymentId: number;
    amount: number;
    paymentDate: Date;
  }) {
    if (args.amount <= 0) return null;
    return this.post({
      date: args.paymentDate,
      description: `Supplier payment #${args.paymentId}`,
      sourceType: "SUPPLIER_PAYMENT",
      sourceId: args.paymentId,
      lines: [
        { accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE, debit: args.amount },
        { accountCode: ACCOUNT_CODES.CASH, credit: args.amount },
      ],
    });
  }

  /**
   * Purchase received:
   *   DR Inventory   totalAmount
   *   CR Cash        paidAmount
   *   CR AP          remainingAmount
   */
  async postPurchase(args: {
    purchaseId: number;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    purchaseDate: Date;
  }) {
    if (args.totalAmount <= 0) return null;
    const lines: Array<{
      accountCode: string;
      debit?: number;
      credit?: number;
    }> = [
      { accountCode: ACCOUNT_CODES.INVENTORY, debit: args.totalAmount },
    ];
    if (args.paidAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.CASH,
        credit: args.paidAmount,
      });
    }
    if (args.remainingAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        credit: args.remainingAmount,
      });
    }
    return this.post({
      date: args.purchaseDate,
      description: `Purchase #${args.purchaseId} received`,
      sourceType: "PURCHASE",
      sourceId: args.purchaseId,
      lines,
    });
  }

  /** SUPER_ADMIN-only listings. */
  async listEntries(filters: {
    sourceType?: string;
    sourceId?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {};
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.sourceId !== undefined) where.sourceId = filters.sourceId;
    if (filters.from || filters.to) {
      where.date = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: "desc" },
        include: {
          lines: { include: { account: true } },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneEntry(id: number) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    return entry;
  }
}
