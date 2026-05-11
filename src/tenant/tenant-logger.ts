import { Logger } from "@nestjs/common";
import { getTenantContext } from "./tenant-context";

/**
 * Build the `[req:abc123][company:7]` prefix from the active tenant context.
 *
 *  - `req:none` if invoked outside a request (cron/seed without an explicit
 *    `tenantStorage.run`).
 *  - `company:all*` when SUPER_ADMIN is unscoped (sees every tenant). The
 *    `*` is a visual cue that this is a privileged view.
 *  - `company:N*` when SUPER_ADMIN is impersonating tenant N.
 *  - `company:N` for COMPANY_ADMIN / COMPANY_USER bound to tenant N.
 *  - `company:none` for SUPER_ADMIN with `companyId = null` and no scope.
 */
export function tenantLogPrefix(): string {
  const ctx = getTenantContext();
  if (!ctx) return "[req:none][company:none]";
  const reqId = ctx.requestId ?? "?";
  let company: string;
  if (ctx.userRole === "SUPER_ADMIN") {
    company =
      ctx.superAdminFilterCompanyId != null
        ? `${ctx.superAdminFilterCompanyId}*`
        : "all*";
  } else {
    company = ctx.companyId != null ? String(ctx.companyId) : "none";
  }
  return `[req:${reqId}][company:${company}]`;
}

/**
 * Drop-in replacement for `new Logger(name)` that automatically prefixes
 * every line with `tenantLogPrefix()`. Use it in any service whose log
 * output you want to be able to trace back to a specific tenant + request
 * during triage.
 *
 * Existing `Logger` callers continue to work; this is opt-in. For ad-hoc
 * single-line tenant prefixing, just call `tenantLogPrefix()` directly.
 */
export class TenantLogger {
  private readonly inner: Logger;

  constructor(name: string) {
    this.inner = new Logger(name);
  }

  log(message: any, ...optional: any[]) {
    this.inner.log(`${tenantLogPrefix()} ${message}`, ...optional);
  }

  warn(message: any, ...optional: any[]) {
    this.inner.warn(`${tenantLogPrefix()} ${message}`, ...optional);
  }

  error(message: any, ...optional: any[]) {
    this.inner.error(`${tenantLogPrefix()} ${message}`, ...optional);
  }

  debug(message: any, ...optional: any[]) {
    this.inner.debug?.(`${tenantLogPrefix()} ${message}`, ...optional);
  }

  verbose(message: any, ...optional: any[]) {
    this.inner.verbose?.(`${tenantLogPrefix()} ${message}`, ...optional);
  }
}
