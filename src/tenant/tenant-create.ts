/**
 * Single-tenant build: these helpers used to wrap Prisma create payloads
 * so a tenant-scoped extension could inject `companyId` at runtime. After
 * the multi-tenancy removal, `companyId` no longer exists on any model
 * and the wrappers are kept ONLY as identity-function shims so the dozens
 * of existing service call-sites keep compiling without edits. They can
 * be inlined and removed later in a cleanup pass.
 */
export function tenantCreate<T>(data: object): T {
  return data as unknown as T;
}
export function tenantCreateStrict<T>(data: T): T {
  return data;
}
export function tenantCreateMany<T>(rows: T[]): T[] {
  return rows;
}
