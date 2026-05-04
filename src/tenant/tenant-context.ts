import { AsyncLocalStorage } from "async_hooks";

/**
 * Per-request user context that flows through every async call without
 * threading it through every service method. Stored via AsyncLocalStorage
 * (Node's request-scoped equivalent of thread-locals).
 *
 * Populated by TenantInterceptor at the start of each request from req.user;
 * read by the tenant-aware Prisma extension to scope queries.
 */
export type UserRoleName = "SUPER_ADMIN" | "COMPANY_ADMIN" | "COMPANY_USER";

export interface TenantContextData {
  userId: number;
  email: string;
  userRole: UserRoleName;
  /** null only for SUPER_ADMIN. */
  companyId: number | null;
  /**
   * Optional override: SUPER_ADMIN can pass `?companyId=42` to scope a query
   * to a specific tenant. When set, tenant scoping uses this value.
   */
  superAdminFilterCompanyId?: number | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantContextData>();

/**
 * Read the current request's tenant context. Returns null outside of a request
 * (e.g. from a cron job) — callers should treat null as "no tenant scoping
 * applied" (= effectively SUPER_ADMIN-style access).
 */
export function getTenantContext(): TenantContextData | null {
  return tenantStorage.getStore() ?? null;
}

/**
 * Resolve the effective companyId to use for the current request:
 *  - SUPER_ADMIN: null (or override if explicitly filtering)
 *  - COMPANY_*  : their companyId, no override allowed
 */
export function effectiveCompanyId(): number | null {
  const ctx = getTenantContext();
  if (!ctx) return null;
  if (ctx.userRole === "SUPER_ADMIN") {
    return ctx.superAdminFilterCompanyId ?? null;
  }
  return ctx.companyId;
}

/** True when the current request has SUPER_ADMIN privileges. */
export function isSuperAdmin(): boolean {
  return getTenantContext()?.userRole === "SUPER_ADMIN";
}
