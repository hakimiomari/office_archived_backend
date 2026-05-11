import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantSqlFilter } from "./tenant-sql";

/**
 * The single sanctioned entry point for `$queryRaw` / `$executeRaw` in the
 * codebase. The Prisma tenant extension does NOT run on raw SQL, so every
 * raw query must include `WHERE <table>.companyId = …` (or `TRUE` for
 * SUPER_ADMIN reads) — and that's easy to forget.
 *
 * This service makes the tenant column a *required argument* and gives the
 * SQL builder a `TENANT_FILTER` Prisma.Sql fragment they must embed in the
 * WHERE clause. A repo lint script (see `scripts/check-raw-sql.sh`) blocks
 * `$queryRaw` / `$executeRaw` from appearing anywhere outside
 * `src/tenant/`, so this is enforced at CI time too.
 *
 * Example:
 *   await this.tenantQuery.queryRaw<Row[]>(
 *     'i."companyId"',
 *     (TENANT) => Prisma.sql`
 *       SELECT i.id FROM items i WHERE ${TENANT} AND i."minStock" > 0
 *     `,
 *   );
 */
@Injectable()
export class TenantQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a tenant-scoped `$queryRaw`. The `column` argument names the tenant
   * column (e.g. `'i."companyId"'`); pass it through `${TENANT_FILTER}` in
   * the SQL builder.
   */
  async queryRaw<T = unknown>(
    column: string,
    build: (TENANT_FILTER: Prisma.Sql) => Prisma.Sql,
  ): Promise<T> {
    const sql = build(tenantSqlFilter(column));
    return (this.prisma as any).$queryRaw(sql) as Promise<T>;
  }

  /** Tx variant — use when inside a `$transaction` callback. */
  async queryRawTx<T = unknown>(
    tx: Prisma.TransactionClient,
    column: string,
    build: (TENANT_FILTER: Prisma.Sql) => Prisma.Sql,
  ): Promise<T> {
    const sql = build(tenantSqlFilter(column));
    return tx.$queryRaw(sql) as Promise<T>;
  }

  /** Tenant-scoped `$executeRaw`. Returns the affected row count. */
  async executeRaw(
    column: string,
    build: (TENANT_FILTER: Prisma.Sql) => Prisma.Sql,
  ): Promise<number> {
    const sql = build(tenantSqlFilter(column));
    return (this.prisma as any).$executeRaw(sql) as Promise<number>;
  }

  /** Tx variant of executeRaw. */
  async executeRawTx(
    tx: Prisma.TransactionClient,
    column: string,
    build: (TENANT_FILTER: Prisma.Sql) => Prisma.Sql,
  ): Promise<number> {
    const sql = build(tenantSqlFilter(column));
    return tx.$executeRaw(sql);
  }
}
