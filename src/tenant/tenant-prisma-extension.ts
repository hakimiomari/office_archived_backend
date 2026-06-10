import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  effectiveCompanyId,
  isSuperAdmin,
  showDeleted,
} from "./tenant-context";
import { tenantLogPrefix } from "./tenant-logger";
import { emitAuditEvent } from "./audit-sink";

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
  // Accounting (§5.1)
  "Account",
  "JournalEntry",
  "JournalLine",
  // Banking / reconciliation (§5.2)
  "BankAccount",
  "BankTransaction",
  "Reconciliation",
  // Subscription layer — only CompanySubscription is tenant-scoped;
  // Plan / PlanModule / PlanFeature / PlanLimit are global config.
  "CompanySubscription",
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

/**
 * Models that emit audit events on writes. Subset of TENANT_MODELS.
 * Excluded models are either themselves an audit trail (StockMovement)
 * or get updated on every parent write (InventoryStock / Batch, line
 * items). Their parent's audit row + the StockMovement row are enough.
 */
const AUDITED_MODELS = new Set([
  "Item",
  "Warehouse",
  "Alert",
  "StockCount",
  "Category",
  "Supplier",
  "Purchase",
  "SupplierPayment",
  "Customer",
  "Sale",
  "Payment",
  "Employee",
  "Department",
  // Accounting: every chart change + every posted journal entry is
  // significant. Journal lines are children and don't need their own
  // row — the parent JournalEntry audit captures the action.
  "Account",
  "JournalEntry",
  // Banking: BankAccount + Reconciliation are operator actions worth
  // auditing. BankTransaction is excluded — imports can produce
  // thousands of rows and individual matches are usually frequent;
  // the import operation can be logged at the service level if needed.
  "BankAccount",
  "Reconciliation",
  // Subscription changes (upgrade / downgrade / cancel) are
  // operationally significant — always audit.
  "CompanySubscription",
]);

/**
 * Operations whose results we post-filter for soft-deleted rows.
 * `findUnique` and `findUniqueOrThrow` cannot have `deletedAt: null` added
 * to their where clauses (Prisma's `findUnique` only accepts unique-key
 * fields in `where`), so instead we run the query and discard the row if
 * `deletedAt` is set.
 */
const POST_FILTER_OPS = new Set(["findUnique", "findUniqueOrThrow"]);

const CREATE_OPS = new Set(["create", "createMany"]);

/**
 * Parent → { relationField → childModel } for nested writes whose child
 * rows are tenant-scoped. Prisma's nested `create` / `createMany` on these
 * fields does NOT propagate companyId from the parent automatically (it
 * only auto-fills the FK to the parent), so we walk the nested write
 * payload at extension time and inject companyId into each child row.
 *
 * Without this table, callers that do
 *   prisma.sale.create({ data: { …, items: { create: [{itemId, …}] } } })
 * would hit a NOT NULL constraint error on `sale_items.companyId`.
 */
const TENANT_NESTED_CHILDREN: Record<string, Record<string, string>> = {
  Sale: { items: "SaleItem", payments: "Payment" },
  Purchase: { items: "PurchaseItem", payments: "SupplierPayment" },
  StockCount: { lines: "StockCountLine" },
  // Accounting (§5.1): every journal entry creates its lines in a single
  // nested write so the entry+lines either both commit or neither does.
  JournalEntry: { lines: "JournalLine" },
};

function injectIntoNestedWrites(
  parentModel: string,
  data: any,
  companyId: number,
) {
  const children = TENANT_NESTED_CHILDREN[parentModel];
  if (!data || !children) return;
  for (const [relationField, childModel] of Object.entries(children)) {
    const nested = data[relationField];
    if (!nested || typeof nested !== "object") continue;

    // { create: row | row[] }
    if (nested.create !== undefined) {
      if (Array.isArray(nested.create)) {
        nested.create = nested.create.map((r: any) => {
          const next = { ...r, companyId };
          injectIntoNestedWrites(childModel, next, companyId);
          return next;
        });
      } else if (typeof nested.create === "object") {
        nested.create = { ...nested.create, companyId };
        injectIntoNestedWrites(childModel, nested.create, companyId);
      }
    }
    // { createMany: { data: row[] } }
    if (nested.createMany?.data) {
      const rows = nested.createMany.data;
      if (Array.isArray(rows)) {
        nested.createMany.data = rows.map((r: any) => ({ ...r, companyId }));
      } else {
        nested.createMany.data = { ...rows, companyId };
      }
    }
  }
}

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
 * Cross-tenant write attempts: counter + structured warnings. A "cross-tenant
 * write attempt" is when service code passes a `data.companyId` (or a
 * `where.companyId` on update/delete) that disagrees with the tenant the
 * caller is bound to. The extension still corrects the value (system always
 * wins), but we count + log every occurrence so triage can surface them.
 *
 * Read via `getTenantStats()`; reset via `resetTenantStats()`.
 */
const stats = {
  blockedCrossTenantCreates: 0,
  blockedCrossTenantWrites: 0,
  totalQueriesScoped: 0,
};

export function getTenantStats() {
  return { ...stats };
}

export function resetTenantStats() {
  stats.blockedCrossTenantCreates = 0;
  stats.blockedCrossTenantWrites = 0;
  stats.totalQueriesScoped = 0;
}

const warnLogger = new Logger("TenantExtension");

/**
 * Captured handle to the extended client. Set during `tenantExtension()`'s
 * factory invocation. Used by the delete→soft-delete conversion to invoke
 * `update` / `updateMany` recursively through the same extension chain,
 * so tenant scoping and the showDeleted toggle both still apply.
 */
let extendedClientRef: any = null;

function modelAccessorKey(model: string): string {
  // Prisma model accessors are camelCase: "Sale" → "sale", "StockMovement" → "stockMovement".
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function injectDeletedAtFilter(where: any): any {
  if (!where) return { deletedAt: null };
  if (where.deletedAt !== undefined) return where;
  return { ...where, deletedAt: null };
}

/**
 * Fire-and-forget audit-log emission after a successful tenant-model
 * write. Skipped for non-audited models (StockMovement is itself an audit
 * trail; InventoryStock/Batch are written on every parent change and
 * would add noise).
 *
 * The action name distinguishes:
 *  - `xxx.create` / `xxx.createMany`
 *  - `xxx.update` (regular update)
 *  - `xxx.delete` (an update that set `deletedAt = <date>` — including
 *    the recursive call from the soft-delete conversion path)
 *  - `xxx.restore` (an update that set `deletedAt = null`)
 */
function emitWriteAudit(
  model: string,
  operation: string,
  args: any,
  result: any,
) {
  if (!AUDITED_MODELS.has(model)) return;
  if (!CREATE_OPS.has(operation) && !UPDATE_OPS.has(operation)) return;

  const prefix = model.charAt(0).toLowerCase() + model.slice(1);
  let action: string;
  if (operation === "create") action = `${prefix}.create`;
  else if (operation === "createMany") action = `${prefix}.createMany`;
  else if (operation === "upsert") action = `${prefix}.upsert`;
  else if (operation === "update" || operation === "updateMany") {
    const data = args?.data;
    if (data?.deletedAt instanceof Date) action = `${prefix}.delete`;
    else if (data?.deletedAt === null) action = `${prefix}.restore`;
    else action = `${prefix}.${operation}`;
  } else if (operation === "delete" || operation === "deleteMany") {
    // Defensive: shouldn't reach here since delete is converted upstream,
    // but fall through cleanly if it ever did (e.g. system context).
    action = `${prefix}.${operation}`;
  } else {
    action = `${prefix}.${operation}`;
  }

  const entityId =
    result && typeof result === "object" && typeof result.id === "number"
      ? result.id
      : null;

  emitAuditEvent({ action, entity: model, entityId });
}

const TENANT_DEBUG =
  process.env.TENANT_DEBUG === "1" || process.env.TENANT_DEBUG === "true";

function debugLog(model: string, operation: string, args: any) {
  if (!TENANT_DEBUG) return;
  // Best-effort serialisation; some Prisma values (Date, Decimal) won't
  // round-trip cleanly but JSON.stringify is enough for triage.
  try {
    warnLogger.debug(
      `${tenantLogPrefix()} ${model}.${operation} ` +
        JSON.stringify({ where: args?.where, data: args?.data }, replacer),
    );
  } catch {
    warnLogger.debug(`${tenantLogPrefix()} ${model}.${operation} <unserialisable args>`);
  }
}

function replacer(_k: string, v: any) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

function notedCrossTenantCreate(
  model: string,
  enforced: number,
  given: number,
) {
  stats.blockedCrossTenantCreates++;
  warnLogger.warn(
    `${tenantLogPrefix()} cross_tenant_create_blocked model=${model} ` +
      `enforced=${enforced} given=${given} (overridden to enforced)`,
  );
}

function notedCrossTenantWrite(
  model: string,
  operation: string,
  enforced: number,
  given: number,
) {
  stats.blockedCrossTenantWrites++;
  warnLogger.warn(
    `${tenantLogPrefix()} cross_tenant_write_blocked model=${model} ` +
      `op=${operation} enforced=${enforced} given=${given} (where.companyId rewritten)`,
  );
}

/**
 * Tenant-scoping Prisma client extension.
 *
 * Reads: silently injects `where.companyId = <ctx.companyId>` for every
 *   tenant model, unless the caller is SUPER_ADMIN (no filter) or already
 *   set companyId explicitly (e.g. SUPER_ADMIN filtering a specific company).
 *
 * Writes (create): injects `data.companyId` if missing; if the caller
 *   already supplied a different value, we count it as a cross-tenant
 *   attempt, warn, and still overwrite with the enforced value.
 * Writes (update/delete): scopes the where clause; if the caller supplied
 *   a different `where.companyId`, we rewrite it to the enforced value
 *   (silently allowing it would let a non-SUPER_ADMIN target rows in
 *   another tenant).
 *
 * Non-tenant models (User, Role, Permission, …) pass through untouched.
 *
 * Set `TENANT_DEBUG=1` in the environment to print every scoped query's
 * final `where` / `data` (post-injection) for triage.
 */
export function tenantExtension() {
  return Prisma.defineExtension((client) => {
    const ext = client.$extends({
      name: "tenantScope",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // Only intercept tenant models.
            if (!model || !TENANT_MODELS.has(model)) {
              return query(args);
            }

            const includeDeleted = showDeleted();

            // ── Soft delete conversion ────────────────────────────────────
            // `delete` becomes an `update` setting `deletedAt = now`.
            // `deleteMany` becomes `updateMany` with the same data, scoped
            // to deletedAt: null so the same row isn't soft-deleted twice
            // (still safe if it were — but `updatedAt` would change).
            //
            // The recursive call goes through `extendedClientRef` so the
            // converted operation re-enters this hook and picks up tenant
            // scoping (companyId, cross-tenant attempts, etc.) the same
            // way a normal update would.
            if (
              extendedClientRef &&
              (operation === "delete" || operation === "deleteMany")
            ) {
              const key = modelAccessorKey(model);
              if (operation === "delete") {
                return extendedClientRef[key].update({
                  where: (args as any).where,
                  data: { deletedAt: new Date() },
                });
              }
              return extendedClientRef[key].updateMany({
                where: {
                  ...((args as any).where ?? {}),
                  deletedAt: null,
                },
                data: { deletedAt: new Date() },
              });
            }

            // SUPER_ADMIN with no explicit company filter: pass through (sees all).
            if (isSuperAdmin()) {
              const explicitCompanyId = effectiveCompanyId();
              if (explicitCompanyId == null) {
                // Even unscoped SUPER_ADMIN respects deletedAt unless
                // they explicitly asked to see deleted rows.
                if (
                  !includeDeleted &&
                  (READ_OPS.has(operation) || UPDATE_OPS.has(operation))
                ) {
                  const a: any = args;
                  a.where = injectDeletedAtFilter(a.where);
                }
                debugLog(model, operation, args);
                const r = await query(args);
                emitWriteAudit(model, operation, args, r);
                return POST_FILTER_OPS.has(operation) && !includeDeleted
                  ? filterDeletedResult(r)
                  : r;
              }
              // SUPER_ADMIN explicitly scoping to a company — fall through.
              const a: any = args;
              if (READ_OPS.has(operation) || UPDATE_OPS.has(operation)) {
                a.where = scopeWhere(a.where, explicitCompanyId);
                if (!includeDeleted) {
                  a.where = injectDeletedAtFilter(a.where);
                }
              }
              if (operation === "create") {
                a.data = { companyId: explicitCompanyId, ...(a.data ?? {}) };
                injectIntoNestedWrites(model, a.data, explicitCompanyId);
              }
              if (operation === "createMany") {
                const rows = Array.isArray(a.data) ? a.data : [a.data];
                a.data = rows.map((r: any) => ({
                  companyId: explicitCompanyId,
                  ...r,
                }));
              }
              if (operation === "upsert") {
                if (a.create) {
                  a.create = {
                    companyId: explicitCompanyId,
                    ...a.create,
                  };
                  injectIntoNestedWrites(model, a.create, explicitCompanyId);
                }
              }
              stats.totalQueriesScoped++;
              debugLog(model, operation, a);
              const r = await query(a);
              emitWriteAudit(model, operation, a, r);
              return POST_FILTER_OPS.has(operation) && !includeDeleted
                ? filterDeletedResult(r)
                : r;
            }

            const companyId = effectiveCompanyId();
            // No request context (e.g. seed script, cron without context):
            // don't enforce — the calling code is presumed trusted.
            if (companyId == null) {
              debugLog(model, operation, args);
              return query(args);
            }

            const a: any = args;
            if (READ_OPS.has(operation)) {
              // Detect cross-tenant read attempt and rewrite. (Reading
              // someone else's tenant rows wouldn't return data anyway in
              // most cases, but rewrite for clarity + debugging.)
              if (
                a.where?.companyId !== undefined &&
                a.where.companyId !== companyId
              ) {
                notedCrossTenantWrite(
                  model,
                  operation,
                  companyId,
                  a.where.companyId,
                );
                a.where = { ...a.where, companyId };
              } else {
                a.where = scopeWhere(a.where, companyId);
              }
              // Soft-delete filter for everyone except SUPER_ADMINs who
              // opted in. Skipped for findUnique/findUniqueOrThrow which
              // can't accept non-unique fields in `where` — those are
              // post-filtered after the query returns.
              if (!includeDeleted && !POST_FILTER_OPS.has(operation)) {
                a.where = injectDeletedAtFilter(a.where);
              }
            } else if (UPDATE_OPS.has(operation)) {
              if (
                a.where?.companyId !== undefined &&
                a.where.companyId !== companyId
              ) {
                notedCrossTenantWrite(
                  model,
                  operation,
                  companyId,
                  a.where.companyId,
                );
                a.where = { ...a.where, companyId };
              } else {
                a.where = scopeWhere(a.where, companyId);
              }
              // Don't let updates touch already-soft-deleted rows unless
              // the caller is a SUPER_ADMIN restoring something — that
              // requires `X-Show-Deleted: 1`.
              if (!includeDeleted) {
                a.where = injectDeletedAtFilter(a.where);
              }
              // Note: spread ORDER matters for security here. We put the
              // enforced companyId LAST so client-provided values cannot
              // override it (= cross-tenant write attempt).
              if (operation === "upsert") {
                if (
                  a.create?.companyId !== undefined &&
                  a.create.companyId !== companyId
                ) {
                  notedCrossTenantCreate(model, companyId, a.create.companyId);
                }
                a.create = { ...(a.create ?? {}), companyId };
                injectIntoNestedWrites(model, a.create, companyId);
              }
            } else if (CREATE_OPS.has(operation)) {
              if (operation === "create") {
                if (
                  a.data?.companyId !== undefined &&
                  a.data.companyId !== companyId
                ) {
                  notedCrossTenantCreate(model, companyId, a.data.companyId);
                }
                a.data = { ...(a.data ?? {}), companyId };
                injectIntoNestedWrites(model, a.data, companyId);
              } else {
                const rows = Array.isArray(a.data) ? a.data : [a.data];
                for (const r of rows) {
                  if (
                    r?.companyId !== undefined &&
                    r.companyId !== companyId
                  ) {
                    notedCrossTenantCreate(model, companyId, r.companyId);
                  }
                }
                a.data = rows.map((r: any) => ({ ...r, companyId }));
              }
            }
            stats.totalQueriesScoped++;
            debugLog(model, operation, a);
            const r = await query(a);
            emitWriteAudit(model, operation, a, r);
            return POST_FILTER_OPS.has(operation) && !includeDeleted
              ? filterDeletedResult(r)
              : r;
          },
        },
      },
    });
    extendedClientRef = ext;
    return ext;
  });
}

/**
 * Post-query soft-delete filter for `findUnique` / `findUniqueOrThrow`.
 *
 * These ops can't accept non-unique fields in `where`, so we let the
 * query run normally and drop the row if it turned out to be
 * soft-deleted.
 *
 * `findUniqueOrThrow` requires throwing on null, so we mimic Prisma's
 * `PrismaClientKnownRequestError` semantics by throwing a generic Error
 * with the same message shape — callers usually catch NotFoundException
 * higher up via service wrappers anyway.
 */
function filterDeletedResult(result: any) {
  if (!result) return result;
  if (Array.isArray(result)) return result;
  if (typeof result === "object" && (result as any).deletedAt) return null;
  return result;
}
