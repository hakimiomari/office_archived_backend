import { Injectable, Logger } from "@nestjs/common";
import { AccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantCreateStrict } from "../tenant/tenant-create";
import { TenantService } from "../tenant/tenant.service";

/**
 * Standard small-business chart of accounts. Codes follow the typical
 * 1xxx Assets / 2xxx Liabilities / 3xxx Equity / 4xxx Revenue / 5xxx COGS /
 * 6xxx Expenses pattern. The posting rules in `LedgerService` look up
 * accounts by these codes — DO NOT rename without also updating
 * `ACCOUNT_CODES` below.
 *
 * Tenants are free to add their own additional accounts via the
 * `/accounting/accounts` API later; only the seeded codes are
 * load-bearing.
 */
export const ACCOUNT_CODES = {
  CASH: "1000",
  BANK: "1100",
  ACCOUNTS_RECEIVABLE: "1200",
  INVENTORY: "1300",
  ACCOUNTS_PAYABLE: "2000",
  TAX_PAYABLE: "2100",
  RETAINED_EARNINGS: "3000",
  SALES_REVENUE: "4000",
  SALES_DISCOUNT: "4100",
  COGS: "5000",
  OPERATING_EXPENSES: "6000",
  INVENTORY_ADJUSTMENT: "6100",
} as const;

interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { code: ACCOUNT_CODES.CASH, name: "Cash", type: AccountType.ASSET },
  { code: ACCOUNT_CODES.BANK, name: "Bank", type: AccountType.ASSET },
  { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: "Accounts Receivable", type: AccountType.ASSET },
  { code: ACCOUNT_CODES.INVENTORY, name: "Inventory", type: AccountType.ASSET },
  { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: "Accounts Payable", type: AccountType.LIABILITY },
  { code: ACCOUNT_CODES.TAX_PAYABLE, name: "Sales Tax Payable", type: AccountType.LIABILITY },
  { code: ACCOUNT_CODES.RETAINED_EARNINGS, name: "Retained Earnings", type: AccountType.EQUITY },
  { code: ACCOUNT_CODES.SALES_REVENUE, name: "Sales Revenue", type: AccountType.REVENUE },
  { code: ACCOUNT_CODES.SALES_DISCOUNT, name: "Sales Discount", type: AccountType.REVENUE },
  { code: ACCOUNT_CODES.COGS, name: "Cost of Goods Sold", type: AccountType.EXPENSE },
  { code: ACCOUNT_CODES.OPERATING_EXPENSES, name: "Operating Expenses", type: AccountType.EXPENSE },
  { code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT, name: "Inventory Adjustment", type: AccountType.EXPENSE },
];

@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  /**
   * Idempotent: only inserts accounts whose code doesn't already exist
   * for the tenant. Safe to call multiple times (e.g. on company create
   * AND as a manual repair).
   *
   * Must be called from within a tenant context so the Prisma extension
   * scopes correctly. The caller can use
   *   `await tenantService.runForCompany(id, () => chart.seedDefault())`
   * to run it for a specific tenant from outside a request.
   */
  async seedDefault() {
    const existing = await this.prisma.account.findMany({
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((a) => a.code));
    const missing = SEED_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
    if (missing.length === 0) {
      return { seeded: 0, total: existing.length };
    }
    for (const a of missing) {
      await this.prisma.account.create({
        data: tenantCreateStrict<Prisma.AccountUncheckedCreateInput>(a),
      });
    }
    this.logger.log(`Seeded ${missing.length} default account(s)`);
    return { seeded: missing.length, total: existing.length + missing.length };
  }

  /** Seed every active company that doesn't yet have a chart. Used as a
   *  one-shot backfill for the existing data after this migration ships. */
  async backfillAll() {
    const summary = await this.tenants.forEachCompany(async () => {
      return this.seedDefault();
    });
    return summary;
  }

  /** Look up an account by code within the current tenant. Returns null
   *  if the chart hasn't been seeded yet — callers should treat null as
   *  "skip posting and log a warning". */
  async findByCode(code: string) {
    return this.prisma.account.findFirst({ where: { code } });
  }

  async list() {
    return this.prisma.account.findMany({
      orderBy: { code: "asc" },
    });
  }
}
