import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  BankTransactionDirection,
  BankTransactionStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantCreate, tenantCreateStrict } from "../tenant/tenant-create";
import {
  BankTransactionFilterDto,
  BankTransactionInput,
  CreateBankTransactionDto,
  ImportBankTransactionsDto,
  MatchBankTransactionDto,
} from "./banking.dto";

/**
 * Bank transaction rows are an append-only mirror of the bank
 * statement. They start as `UNMATCHED` and graduate to `MATCHED` once
 * linked to a Payment or SupplierPayment. `IGNORED` is for rows the
 * operator decides aren't business-relevant (bank fees, interest, etc.)
 * — for v1 the linkage is manual; future work can post journal entries
 * for those too.
 *
 * Auto-match rule (v1):
 *  - Same companyId (enforced by extension).
 *  - Same amount (exact match).
 *  - Direction → CREDIT pairs with Payment (sales), DEBIT pairs with
 *    SupplierPayment.
 *  - paymentDate within ±matchWindowDays of statementDate (default 2).
 *  - Optional: reference equality breaks ties when multiple candidates
 *    line up by amount + date.
 *  - If exactly one candidate matches → link it. Otherwise leave
 *    UNMATCHED so a human can resolve it.
 */
@Injectable()
export class BankTransactionsService {
  private readonly logger = new Logger(BankTransactionsService.name);
  private static readonly DEFAULT_MATCH_WINDOW_DAYS = 2;
  private static readonly MS_PER_DAY = 86_400_000;

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBankTransactionDto) {
    await this.ensureBankAccount(dto.bankAccountId);
    return this.prisma.bankTransaction.create({
      data: tenantCreateStrict<Prisma.BankTransactionUncheckedCreateInput>({
        bankAccountId: dto.bankAccountId,
        statementDate: new Date(dto.statementDate),
        direction: dto.direction as BankTransactionDirection,
        amount: dto.amount,
        description: dto.description ?? null,
        reference: dto.reference ?? null,
        raw: (dto.raw ?? Prisma.JsonNull) as any,
      }),
    });
  }

  /**
   * Bulk import. `transactions` are inserted in a single createMany so
   * the import is atomic. Returns the count for the caller's toast.
   */
  async import(dto: ImportBankTransactionsDto) {
    await this.ensureBankAccount(dto.bankAccountId);
    if (dto.transactions.length === 0) return { imported: 0 };

    const rows = dto.transactions.map((t: BankTransactionInput) => ({
      bankAccountId: dto.bankAccountId,
      statementDate: new Date(t.statementDate),
      direction: t.direction as BankTransactionDirection,
      amount: t.amount,
      description: t.description ?? null,
      reference: t.reference ?? null,
      raw: (t.raw ?? Prisma.JsonNull) as any,
    }));

    // companyId on each row is injected by the tenant extension's
    // createMany path. We use tenantCreate (not strict) because the
    // shape isn't a perfect Omit<…, 'companyId'> — Prisma's
    // createMany input type lacks the relations.
    await this.prisma.bankTransaction.createMany({
      data: tenantCreate<Prisma.BankTransactionUncheckedCreateInput[]>(rows),
    });
    return { imported: rows.length };
  }

  async findAll(filters: BankTransactionFilterDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.BankTransactionWhereInput = {};
    if (filters.bankAccountId)
      where.bankAccountId = filters.bankAccountId;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.statementDate = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ statementDate: "desc" }, { id: "desc" }],
        include: {
          bankAccount: { select: { id: true, name: true, currency: true } },
          matchedPayment: { select: { id: true, amount: true, paymentDate: true } },
          matchedSupplierPayment: {
            select: { id: true, amount: true, paymentDate: true },
          },
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const t = await this.prisma.bankTransaction.findUnique({
      where: { id },
      include: {
        bankAccount: true,
        matchedPayment: true,
        matchedSupplierPayment: true,
      },
    });
    if (!t) throw new NotFoundException(`Bank transaction ${id} not found`);
    return t;
  }

  /**
   * Manual match. Exactly one of `paymentId` / `supplierPaymentId` must
   * be set. We don't validate direction-compatibility — the operator
   * may want to override (rare but legitimate, e.g. for a refund).
   */
  async match(
    id: number,
    dto: MatchBankTransactionDto,
    userId?: string,
  ) {
    const t = await this.findOne(id);
    if (t.status === BankTransactionStatus.MATCHED) {
      throw new BadRequestException("Already matched; unmatch first");
    }
    const wantsPayment = dto.paymentId !== undefined;
    const wantsSupplier = dto.supplierPaymentId !== undefined;
    if (wantsPayment === wantsSupplier) {
      throw new BadRequestException(
        "Specify exactly one of paymentId or supplierPaymentId",
      );
    }
    if (wantsPayment) {
      const p = await this.prisma.payment.findUnique({
        where: { id: dto.paymentId! },
      });
      if (!p) throw new NotFoundException(`Payment ${dto.paymentId} not found`);
    } else {
      const sp = await this.prisma.supplierPayment.findUnique({
        where: { id: dto.supplierPaymentId! },
      });
      if (!sp)
        throw new NotFoundException(
          `Supplier payment ${dto.supplierPaymentId} not found`,
        );
    }
    return this.prisma.bankTransaction.update({
      where: { id },
      data: {
        status: BankTransactionStatus.MATCHED,
        matchedPaymentId: dto.paymentId ?? null,
        matchedSupplierPaymentId: dto.supplierPaymentId ?? null,
        matchedAt: new Date(),
        matchedBy: userId ?? null,
      },
    });
  }

  async unmatch(id: number) {
    await this.findOne(id);
    return this.prisma.bankTransaction.update({
      where: { id },
      data: {
        status: BankTransactionStatus.UNMATCHED,
        matchedPaymentId: null,
        matchedSupplierPaymentId: null,
        matchedAt: null,
        matchedBy: null,
      },
    });
  }

  async ignore(id: number) {
    const t = await this.findOne(id);
    if (t.status === BankTransactionStatus.MATCHED) {
      throw new BadRequestException("Unmatch before ignoring");
    }
    return this.prisma.bankTransaction.update({
      where: { id },
      data: { status: BankTransactionStatus.IGNORED },
    });
  }

  /**
   * Auto-match unmatched transactions to Payment / SupplierPayment rows.
   *
   * Conservative: only links when exactly one candidate matches. If two
   * Payments both have the same amount within the window, we leave the
   * bank row UNMATCHED so a human can pick. Returns a summary count
   * and the per-row outcomes for the caller's report.
   */
  async autoMatch(opts: {
    bankAccountId?: number;
    matchWindowDays?: number;
  } = {}) {
    const windowDays =
      opts.matchWindowDays ??
      BankTransactionsService.DEFAULT_MATCH_WINDOW_DAYS;
    const windowMs = windowDays * BankTransactionsService.MS_PER_DAY;

    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        status: BankTransactionStatus.UNMATCHED,
        ...(opts.bankAccountId
          ? { bankAccountId: opts.bankAccountId }
          : {}),
      },
      orderBy: { statementDate: "asc" },
    });

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;

    for (const tx of candidates) {
      const from = new Date(tx.statementDate.getTime() - windowMs);
      const to = new Date(tx.statementDate.getTime() + windowMs);

      if (tx.direction === BankTransactionDirection.CREDIT) {
        const matches = await this.prisma.payment.findMany({
          where: {
            amount: tx.amount,
            paymentDate: { gte: from, lte: to },
            bankTransactions: { none: {} }, // not already linked to any bank tx
          },
          select: { id: true, referenceNo: true },
          take: 3,
        });
        const resolved = pickBest(matches, tx.reference);
        if (resolved) {
          await this.prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: BankTransactionStatus.MATCHED,
              matchedPaymentId: resolved.id,
              matchedAt: new Date(),
              matchedBy: "auto",
            },
          });
          matched++;
        } else if (matches.length > 1) {
          ambiguous++;
        } else {
          unmatched++;
        }
      } else {
        const matches = await this.prisma.supplierPayment.findMany({
          where: {
            amount: tx.amount,
            paymentDate: { gte: from, lte: to },
            bankTransactions: { none: {} },
          },
          select: { id: true, referenceNo: true },
          take: 3,
        });
        const resolved = pickBest(matches, tx.reference);
        if (resolved) {
          await this.prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: BankTransactionStatus.MATCHED,
              matchedSupplierPaymentId: resolved.id,
              matchedAt: new Date(),
              matchedBy: "auto",
            },
          });
          matched++;
        } else if (matches.length > 1) {
          ambiguous++;
        } else {
          unmatched++;
        }
      }
    }

    const summary = {
      scanned: candidates.length,
      matched,
      ambiguous,
      unmatched,
    };
    this.logger.log(
      `auto-match summary: scanned=${summary.scanned} matched=${summary.matched} ambiguous=${summary.ambiguous} unmatched=${summary.unmatched}`,
    );
    return summary;
  }

  private async ensureBankAccount(id: number) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!account)
      throw new NotFoundException(`Bank account ${id} not found`);
    return account;
  }
}

/**
 * Pick the best candidate from a small set. Returns the unique match
 * when count is 1; or the candidate whose `referenceNo` equals the
 * bank-side reference when multiple candidates tie on amount/date.
 * Returns null when ambiguity can't be broken.
 */
function pickBest<T extends { id: number; referenceNo: string | null }>(
  candidates: T[],
  bankReference: string | null,
): T | null {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0 || !bankReference) return null;
  const byRef = candidates.filter(
    (c) => c.referenceNo && c.referenceNo === bankReference,
  );
  return byRef.length === 1 ? byRef[0] : null;
}
