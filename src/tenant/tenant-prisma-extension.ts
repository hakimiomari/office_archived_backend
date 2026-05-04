import { Prisma } from "@prisma/client";
import { effectiveCompanyId, isSuperAdmin } from "./tenant-context";

/**
 * Models that carry a `companyId` column. We only extend reads/writes for
 * these — auth tables (users, roles, permissions, archives, licenses) are
 * untouched, since the role/permission system is global.
 */
const TENANT_MODELS = new Set([
  "Item",
  "Warehouse",
  "InventoryStock",
  "InventoryBatch",
  "StockMovement",
  "Alert",
  "StockCount",
  "StockCountLine",
  "Category",
  "Supplier",
  "Purchase",
  "PurchaseItem",
  "SupplierPayment",
  "Customer",
  "Sale",
  "SaleItem",
  "Payment",
  "Employee",
  "Department",
]);

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const UPDATE_OPS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPS = new Set(["create", "createMany"]);

/**
 * Inject `companyId` filter into a `where` clause. Composes with the caller's
 * existing AND so neither side is overwritten.
 */
function scopeWhere(where: any, companyId: number): any {
  if (!where) return { companyId };
  if (where.companyId !== undefined) return where; // caller explicitly set it
  return { ...where, companyId };
}

/**
 * Tenant-scoping Prisma client extension.
 *
 * Reads: silently injects `where.companyId = <ctx.companyId>` for every
 *   tenant model, unless the caller is SUPER_ADMIN (no filter) or already
 *   set companyId explicitly (e.g. SUPER_ADMIN filtering a specific company).
 *
 * Writes (create): injects `data.companyId` if missing.
 * Writes (update/delete): scopes the where clause the same way as reads.
 *
 * Non-tenant models (User, Role, Permission, …) pass through untouched.
 */
export function tenantExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "tenantScope",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // Only intercept tenant models.
            if (!model || !TENANT_MODELS.has(model)) {
              return query(args);
            }

            // SUPER_ADMIN with no explicit company filter: pass through (sees all).
            if (isSuperAdmin()) {
              const explicitCompanyId = effectiveCompanyId();
              if (explicitCompanyId == null) return query(args);
              // SUPER_ADMIN explicitly scoping to a company — fall through.
              const a: any = args;
              if (READ_OPS.has(operation) || UPDATE_OPS.has(operation)) {
                a.where = scopeWhere(a.where, explicitCompanyId);
              }
              if (operation === "create") {
                a.data = { companyId: explicitCompanyId, ...(a.data ?? {}) };
              }
              if (operation === "createMany") {
                const rows = Array.isArray(a.data) ? a.data : [a.data];
                a.data = rows.map((r: any) => ({
                  companyId: explicitCompanyId,
                  ...r,
                }));
              }
              return query(a);
            }

            const companyId = effectiveCompanyId();
            // No request context (e.g. seed script, cron without context):
            // don't enforce — the calling code is presumed trusted.
            if (companyId == null) return query(args);

            const a: any = args;
            if (READ_OPS.has(operation)) {
              a.where = scopeWhere(a.where, companyId);
            } else if (UPDATE_OPS.has(operation)) {
              a.where = scopeWhere(a.where, companyId);
              // Note: spread ORDER matters for security here. We put the
              // enforced companyId LAST so client-provided values cannot
              // override it (= cross-tenant write attempt).
              if (operation === "upsert") {
                a.create = { ...(a.create ?? {}), companyId };
              }
            } else if (CREATE_OPS.has(operation)) {
              if (operation === "create") {
                a.data = { ...(a.data ?? {}), companyId };
              } else {
                const rows = Array.isArray(a.data) ? a.data : [a.data];
                a.data = rows.map((r: any) => ({ ...r, companyId }));
              }
            }
            return query(a);
          },
        },
      },
    }),
  );
}
