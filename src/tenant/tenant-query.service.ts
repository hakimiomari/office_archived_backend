import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Single-tenant shim. Originally wrapped raw SQL with a per-request
 * companyId filter; preserves the original call shape so existing
 * services keep compiling. The previous API was:
 *
 *   tenantQuery.queryRaw('table."companyId"', (TENANT) => Prisma.sql`
 *     SELECT … WHERE ${TENANT} AND …
 *   `)
 *
 * Callers received a `TENANT` SQL fragment they could splice into a
 * larger query. After the multi-tenancy removal there is no tenant to
 * scope to, so `TENANT` is just `TRUE` — a no-op predicate the planner
 * folds away. The column-name arg is accepted and ignored.
 */
@Injectable()
export class TenantQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Empty SQL fragment — no companyId filter to inject. */
  companyIdSqlFragment(_alias?: string): string {
    return "";
  }
  companyIdSqlParams(): any[] {
    return [];
  }
  scopeWhere<T extends object>(where: T): T {
    return where;
  }

  /**
   * Build + execute a `Prisma.sql` query using the live extended client.
   * `_companyCol` is accepted to match the legacy `(column, builder)`
   * signature but is ignored — `TENANT` is hard-wired to `TRUE`.
   */
  async queryRaw<T = any>(
    _companyCol: string,
    builder: (tenant: Prisma.Sql) => Prisma.Sql,
  ): Promise<T> {
    const sql = builder(Prisma.sql`TRUE`);
    return (this.prisma as any).$queryRaw(sql);
  }

  /** Transaction-scoped variant. Returns the affected row count. */
  async executeRawTx(
    tx: any,
    _companyCol: string,
    builder: (tenant: Prisma.Sql) => Prisma.Sql,
  ): Promise<number> {
    const sql = builder(Prisma.sql`TRUE`);
    return tx.$executeRaw(sql);
  }
}
