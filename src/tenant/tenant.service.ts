import { Injectable } from "@nestjs/common";

/**
 * Single-tenant shim. Originally scoped operations per-tenant; in single-
 * tenant mode `forEachCompany` and `runForCompany` simply execute the
 * callback once with `null` as the companyId.
 */
@Injectable()
export class TenantService {
  currentCompanyId(): number | null {
    return null;
  }
  isCurrentUserInCompany(_companyId: number | null | undefined): boolean {
    return true;
  }
  assertCompanyAccess(_companyId: number | null | undefined): void {}

  /**
   * Run `fn` once. In multi-tenant mode this iterated every company and
   * returned a `{ total, succeeded, failed, results }` summary; in
   * single-tenant mode we just invoke once and return that same shape
   * so existing callers continue to work.
   */
  async forEachCompany<T>(
    fn: (companyId: number | null) => Promise<T>,
  ): Promise<{ total: number; succeeded: number; failed: number; results: T[] }> {
    try {
      const result = await fn(null);
      return { total: 1, succeeded: 1, failed: 0, results: [result] };
    } catch {
      return { total: 1, succeeded: 0, failed: 1, results: [] };
    }
  }

  /** Run `fn` for the given (or current) company. No scoping is applied. */
  async runForCompany<T>(
    _companyId: number | null | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }
}
