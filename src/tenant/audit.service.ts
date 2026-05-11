import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getTenantContext } from "./tenant-context";
import {
  AuditEvent,
  emitAuditEvent,
  registerAuditSink,
} from "./audit-sink";

/**
 * Audit log writer.
 *
 * Two ways events get written:
 *   1. The Prisma tenant extension calls `emitAuditEvent(...)` after every
 *      audited write on a tenant model. That funnels through the sink
 *      registered by `onModuleInit()` here.
 *   2. Service code calls `AuditService.log(...)` directly for non-CRUD
 *      events: logins, SUPER_ADMIN tenant switches, idempotency rejections,
 *      cross-tenant write attempts, dispatched alerts.
 *
 * `findAll()` exposes the rows for the SUPER_ADMIN-only debug controller.
 */
@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Wire the global sink so the Prisma extension can reach us without
    // needing a Nest DI handle.
    registerAuditSink((event) => this.persist(event), this.logger);
  }

  /**
   * Service-level audit log. The Prisma extension also calls this via the
   * sink for tenant-model writes — but for events that don't correspond
   * to a single DB write (logins, tenant switches, …), call this directly.
   *
   * Missing fields are auto-filled from the active tenant context.
   */
  log(event: AuditEvent) {
    emitAuditEvent(event);
  }

  private async persist(event: AuditEvent) {
    const ctx = getTenantContext();
    const data: Prisma.AuditLogUncheckedCreateInput = {
      companyId: event.companyId ?? ctx?.companyId ?? null,
      userId: event.userId ?? ctx?.userId ?? null,
      email: event.email ?? ctx?.email ?? null,
      action: event.action,
      entity: event.entity ?? null,
      entityId: event.entityId ?? null,
      before:
        event.before === undefined
          ? Prisma.JsonNull
          : (event.before as Prisma.InputJsonValue),
      after:
        event.after === undefined
          ? Prisma.JsonNull
          : (event.after as Prisma.InputJsonValue),
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      requestId: event.requestId ?? ctx?.requestId ?? null,
      notes: event.notes ?? null,
    };
    try {
      // Use raw create that bypasses the tenant extension by going through
      // a sentinel context-free invocation — the extension treats no-context
      // (cron/seed) as trusted and lets companyId be whatever the caller
      // passed. That's exactly what we want here.
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.warn(
        `audit log persist failed for action=${event.action}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * SUPER_ADMIN-only listing. Filters: action prefix, entity, entityId,
   * companyId, userId, date range. Returns most-recent-first.
   */
  async findAll(filters: {
    action?: string;
    entity?: string;
    entityId?: number;
    companyId?: number;
    userId?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = { startsWith: filters.action };
    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId !== undefined) where.entityId = filters.entityId;
    if (filters.companyId !== undefined) where.companyId = filters.companyId;
    if (filters.userId !== undefined) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
