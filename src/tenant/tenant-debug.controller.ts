import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "./super-admin.guard";
import { getTenantStats, resetTenantStats } from "./tenant-prisma-extension";

/**
 * SUPER_ADMIN-only triage endpoints for the multi-tenancy layer. These are
 * NOT authoritative metrics (the counters live in process memory and reset
 * on restart) — they're a quick check during incident response.
 *
 * For persistent metrics, plug a Prometheus exporter into
 * `getTenantStats()` later.
 */
@ApiTags("Admin / Tenant debug")
@Controller("admin/debug/tenant-stats")
@UseGuards(AuthGuard, SuperAdminGuard)
export class TenantDebugController {
  @Get()
  @ApiOperation({
    summary:
      "Tenant-extension counters (in-memory): scoped queries, blocked cross-tenant attempts",
  })
  stats() {
    return getTenantStats();
  }

  @Post("reset")
  @ApiOperation({ summary: "Reset tenant-extension counters" })
  reset() {
    resetTenantStats();
    return { ok: true };
  }
}
