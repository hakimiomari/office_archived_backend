import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FeatureCode } from "@prisma/client";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "./super-admin.guard";
import { SubscriptionFeatureGuard } from "../subscriptions/guards/subscription-feature.guard";
import { RequireFeature } from "../subscriptions/decorators/require-feature.decorator";
import { AuditService } from "./audit.service";

/**
 * SUPER_ADMIN-only audit log query endpoint.
 *
 * The audit log is global (cross-tenant) so SUPER_ADMINs can correlate
 * actions across companies. Filters narrow by action prefix, entity,
 * entity id, tenant, user, or date range. Defaults to 50 rows per page,
 * most-recent first.
 *
 * Subscription gating: unscoped SUPER_ADMINs always see everything.
 * When a SUPER_ADMIN is scoped INTO a specific tenant via the sidebar
 * picker, the `SubscriptionFeatureGuard` enforces that tenant's plan
 * — Pro tenants get the audit view, Basic/Premium tenants don't.
 */
@ApiTags("Admin / Audit Log")
@Controller("admin/audit-logs")
@UseGuards(AuthGuard, SubscriptionFeatureGuard, SuperAdminGuard)
@RequireFeature(FeatureCode.AUDIT_LOGS)
export class AuditLogController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: "Query the audit log (SUPER_ADMIN only)",
  })
  list(
    @Query("action") action?: string,
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("companyId") companyId?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.audit.findAll({
      action,
      entity,
      entityId: entityId ? Number(entityId) : undefined,
      companyId: companyId ? Number(companyId) : undefined,
      userId: userId ? Number(userId) : undefined,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
