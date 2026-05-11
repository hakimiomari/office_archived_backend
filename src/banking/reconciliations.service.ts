import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BankTransactionDirection,
  BankTransactionStatus,
  Prisma,
  ReconciliationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantCreateStrict } from "../tenant/tenant-create";
import { CreateReconciliationDto } from "./banking.dto";

/**
 * Reconciliation period workflow:
 *
 *   1. `open()` — operator declares "we're reconciling Bank A for May
 *      2026, statement opening balance $X, closing balance $Y."
 *      Status starts OPEN.
 *   2. Matching happens (auto + manual) while the period is OPEN.
 *   3. `close()` — operator confirms book balance matches statement
 *      closing balance. Status becomes COMPLETED; future writes to
 *      bank transactions inside the period should be blocked at the
 *      service layer (enforcement is a future hardening pass).
 *
 * `computeBookBalance()` is the live "what does our ledger think the
 * bank balance is" number, derived from the bank account's
 * openingBalance + sum of matched/ignored CREDIT − DEBIT inside the
 * period. The operator compares it to the statement closing balance
 * to confirm the period is clean.
 */
@Injectable()
export class ReconciliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(dto: CreateReconciliationDto, createdBy?: string) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException("periodEnd must be after periodStart");
    }
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: dto.bankAccountId },
    });
    if (!bankAccount) {
      throw new NotFoundException(
        `Bank account ${dto.bankAccountId} not found`,
      );
    }
    return this.prisma.reconciliation.create({
      data: tenantCreateStrict<Prisma.ReconciliationUncheckedCreateInput>({
        bankAccountId: dto.bankAccountId,
        periodStart,
        periodEnd,
        openingBalance: dto.openingBalance,
        closingBalance: dto.closingBalance,
        notes: dto.notes ?? null,
        createdBy: createdBy ?? null,
      }),
    });
  }

  async findAll(bankAccountId?: number) {
    return this.prisma.reconciliation.findMany({
      where: bankAccountId ? { bankAccountId } : {},
      orderBy: [{ periodEnd: "desc" }],
      include: {
        bankAccount: { select: { id: true, name: true, currency: true } },
      },
    });
  }

  async findOne(id: number) {
    const r = await this.prisma.reconciliation.findUnique({
      where: { id },
      include: { bankAccount: true },
    });
    if (!r) throw new NotFoundException(`Reconciliation ${id} not found`);
    return r;
  }

  /**
   * Close the period. Requires bookBalance to match `closingBalance`
   * within 1 cent; if not, the operator gets the mismatch in the
   * exception payload and can decide whether to update statementBalance
   * or fix unmatched transactions first.
   */
  async close(id: number) {
    const r = await this.findOne(id);
    if (r.status === ReconciliationStatus.COMPLETED) {
      throw new BadRequestException("Reconciliation already completed");
    }
    const bookBalance = await this.computeBookBalance(
      r.bankAccountId,
      r.periodStart,
      r.periodEnd,
    );
    const diff = Math.abs(bookBalance - r.closingBalance);
    if (diff > 0.01) {
      throw new BadRequestException(
        `Cannot close: book balance (${bookBalance.toFixed(2)}) does not match statement closing balance (${r.closingBalance.toFixed(2)}). Difference: ${diff.toFixed(2)}`,
      );
    }
    return this.prisma.reconciliation.update({
      where: { id },
      data: {
        status: ReconciliationStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Live book balance for a bank account inside a period. Includes
   * MATCHED + IGNORED transactions (IGNORED meaning "operator
   * acknowledged this row even if it's not linked to a Payment").
   * UNMATCHED rows are excluded because their pairing is undecided.
   */
  async computeBookBalance(
    bankAccountId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { openingBalance: true },
    });
    if (!account) {
      throw new NotFoundException(`Bank account ${bankAccountId} not found`);
    }
    const [credits, debits] = await Promise.all([
      this.prisma.bankTransaction.aggregate({
        where: {
          bankAccountId,
          statementDate: { gte: periodStart, lte: periodEnd },
          direction: BankTransactionDirection.CREDIT,
          status: { not: BankTransactionStatus.UNMATCHED },
        },
        _sum: { amount: true },
      }),
      this.prisma.bankTransaction.aggregate({
        where: {
          bankAccountId,
          statementDate: { gte: periodStart, lte: periodEnd },
          direction: BankTransactionDirection.DEBIT,
          status: { not: BankTransactionStatus.UNMATCHED },
        },
        _sum: { amount: true },
      }),
    ]);
    return (
      account.openingBalance +
      (credits._sum.amount ?? 0) -
      (debits._sum.amount ?? 0)
    );
  }
}
