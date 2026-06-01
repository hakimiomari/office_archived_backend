import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantService } from "./tenant.service";
import { TenantQueryService } from "./tenant-query.service";
import { AuditService } from "./audit.service";

/**
 * Single-tenant shim module. The original TenantModule wired the tenant
 * Prisma extension, audit log, super-admin guard and helpers. After the
 * multi-tenancy removal these services are no-op stubs kept so legacy
 * callers compile. Made `@Global` so consumers don't have to import it.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantService, TenantQueryService, AuditService],
  exports: [TenantService, TenantQueryService, AuditService],
})
export class TenantModule {}
