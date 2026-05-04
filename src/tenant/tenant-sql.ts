import { Prisma } from "@prisma/client";
import { effectiveCompanyId, isSuperAdmin } from "./tenant-context";

/**
 * SQL fragment for raw queries (`$queryRaw`) that need tenant scoping.
 * `$queryRaw` bypasses the Prisma extension, so reports and other custom SQL
 * must include this fragment in their WHERE clause.
 *
 * Usage:
 *   const tFilter = tenantSqlFilter('"items"."companyId"');
 *   await prisma.$queryRaw`
 *     SELECT * FROM items WHERE ${tFilter} AND <other conditions>
 *   `;
 *
 * - Returns `TRUE` for SUPER_ADMIN without a specific company filter.
 * - Returns `"<column>" = $cid` otherwise (parameterised — safe).
 */
export function tenantSqlFilter(column: string): Prisma.Sql {
  const cid = effectiveCompanyId();
  if (isSuperAdmin() && cid == null) return Prisma.sql`TRUE`;
  // Prisma.raw is needed to interpolate the column name (it's identifier,
  // not a parameter). The cid value below IS parameterised.
  return Prisma.sql`${Prisma.raw(column)} = ${cid ?? -1}`;
}
