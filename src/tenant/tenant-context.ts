/**
 * Single-tenant shim. Multi-tenancy was removed; these stubs only exist so
 * legacy call sites keep compiling. Inline + delete later.
 */
export type UserRoleName = "ADMIN" | "USER";

export interface TenantContextData {
  userId: number;
  email: string;
  userRole: UserRoleName;
  /** Always null in single-tenant mode; retained for type compatibility. */
  companyId: number | null;
  /** Always null. */
  superAdminFilterCompanyId?: number | null;
  /** Always undefined. */
  requestId?: string;
  /** Always false. */
  showDeleted?: boolean;
}

export function getTenantContext(): TenantContextData | null {
  return null;
}

export function effectiveCompanyId(): number | null {
  return null;
}

export function isSuperAdmin(): boolean {
  // ADMIN is the top role in single-tenant mode.
  return false;
}

export function showDeleted(): boolean {
  return false;
}
