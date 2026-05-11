import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { TenantService } from "./tenant.service";
import { TenantQueryService } from "./tenant-query.service";
import { TenantDebugController } from "./tenant-debug.controller";
import { AuditService } from "./audit.service";
import { AuditLogController } from "./audit-log.controller";

/**
 * Global so cron services and report services anywhere in the app can
 * inject TenantService / TenantQueryService without each module importing
 * TenantModule.
 *
 * Also hosts the SUPER_ADMIN-only `/admin/debug/tenant-stats` endpoint.
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TenantDebugController, AuditLogController],
  providers: [TenantService, TenantQueryService, AuditService],
  exports: [TenantService, TenantQueryService, AuditService],
})
export class TenantModule {}
