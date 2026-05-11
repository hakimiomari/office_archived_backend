/**
 * Shared sink between the Prisma tenant extension and AuditService.
 *
 * The extension instance is created during `PrismaService` construction,
 * before Nest's DI graph is built. It can't `@Inject(AuditService)`. So
 * AuditService instead registers itself here on bootstrap, and the
 * extension calls `getAuditSink()?.(...)` after every audited write.
 *
 * If AuditService isn't registered yet (e.g. during cold boot or in
 * tests), the sink is a no-op — audit logging silently drops on the
 * floor rather than blocking the primary write.
 */
import type { Logger } from "@nestjs/common";

export interface AuditEvent {
  /** Dot-notated event name, e.g. "sale.create", "sale.delete", "auth.login". */
  action: string;
  /** Prisma model name (e.g. "Sale") for entity events; absent for system events. */
  entity?: string | null;
  /** Row id when applicable. */
  entityId?: number | null;
  /** Tenant the event belongs to. `null` only for cross-tenant SUPER_ADMIN actions. */
  companyId?: number | null;
  /** User who triggered the event; `null` for cron / system. */
  userId?: number | null;
  email?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}

export type AuditSink = (event: AuditEvent) => Promise<void> | void;

let sink: AuditSink | null = null;
let fallbackLogger: Logger | null = null;

export function registerAuditSink(impl: AuditSink, logger?: Logger) {
  sink = impl;
  if (logger) fallbackLogger = logger;
}

export function clearAuditSink() {
  sink = null;
}

export function emitAuditEvent(event: AuditEvent) {
  if (!sink) return;
  try {
    const result = sink(event);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err) => {
        fallbackLogger?.warn(
          `audit sink failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  } catch (err) {
    fallbackLogger?.warn(
      `audit sink threw synchronously: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
