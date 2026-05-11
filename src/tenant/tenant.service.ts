import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  TenantContextData,
  tenantStorage,
} from "./tenant-context";
import { TenantLogger } from "./tenant-logger";

/**
 * Helpers for code that runs OUTSIDE an HTTP request — most importantly cron
 * jobs, queue workers, and seed scripts. These contexts have no
 * AsyncLocalStorage tenant context, so every Prisma query would otherwise see
 * data from every tenant at once.
 *
 * `forEachCompany` lists active companies and runs a callback per tenant
 * inside its own synthetic tenant context, so queries inside the callback are
 * scoped to that one tenant exactly the same way an HTTP request would be.
 *
 * Errors in one tenant's handler are caught and reported, so a bad tenant
 * does not stop the others from being processed.
 *
 * ## Cron architecture rules (ARCHITECTURE_UPGRADE.md §1.1 / §3.4)
 *
 * Every `@Cron` / `@Interval` / `@Timeout` method **must**:
 *   1. Call `tenants.forEachCompany(async (companyId) => { … })` (or
 *      `runForCompany(id, fn)` for queue jobs that already know the
 *      tenant). The `scripts/check-crons.sh` lint guard fails CI if a
 *      scheduled method's file doesn't.
 *   2. Make its body **idempotent**. The same hour / day run twice must
 *      produce the same result; in practice this means upsert-style
 *      writes that check for an existing row before creating, and
 *      treating "already done" as success.
 *   3. Not leak across tenants. Even inside `forEachCompany`, raw SQL
 *      still has to go through `TenantQueryService` so the
 *      `${TENANT_FILTER}` is in the WHERE clause.
 *
 * Genuinely cross-tenant maintenance work (e.g. orphan cleanup) may opt
 * out via the file-level marker `// cron:cross-tenant-ok` — reviewers
 * should flag any new occurrence.
 */
@Injectable()
export class TenantService {
  private readonly logger = new TenantLogger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run `handler` once per active company, each call inside a tenant context
   * scoped to that company. Returns a summary of successes and failures.
   *
   * Implementation note: the synthetic context uses role=SUPER_ADMIN with
   * `superAdminFilterCompanyId` set, because that is the path through the
   * Prisma extension that scopes both reads and writes to a specific company.
   */
  async forEachCompany<T>(
    handler: (companyId: number) => Promise<T>,
  ): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<
      | { companyId: number; ok: true; result: T }
      | { companyId: number; ok: false; error: string }
    >;
  }> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const results: Array<
      | { companyId: number; ok: true; result: T }
      | { companyId: number; ok: false; error: string }
    > = [];

    for (const c of companies) {
      const ctx: TenantContextData = {
        userId: 0,
        email: "system@cron",
        userRole: "SUPER_ADMIN",
        companyId: null,
        superAdminFilterCompanyId: c.id,
      };

      try {
        const result = await tenantStorage.run(ctx, () => handler(c.id));
        results.push({ companyId: c.id, ok: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `forEachCompany handler failed for companyId=${c.id}: ${msg}`,
        );
        results.push({ companyId: c.id, ok: false, error: msg });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return {
      total: companies.length,
      succeeded,
      failed: companies.length - succeeded,
      results,
    };
  }

  /**
   * Run `handler` once inside a tenant context for the given company. Useful
   * for queue workers that already know which tenant a job belongs to.
   */
  async runForCompany<T>(
    companyId: number,
    handler: () => Promise<T>,
  ): Promise<T> {
    const ctx: TenantContextData = {
      userId: 0,
      email: "system@cron",
      userRole: "SUPER_ADMIN",
      companyId: null,
      superAdminFilterCompanyId: companyId,
    };
    return tenantStorage.run(ctx, handler);
  }
}
