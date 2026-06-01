import { Injectable } from "@nestjs/common";

/**
 * Single-tenant shim. The previous audit log was wired through the
 * tenant infra and stored row-level audit events. In single-tenant
 * mode this is a no-op; reintroduce a real implementation later if
 * needed (the schema's AuditLog table was dropped on multi-tenancy
 * removal).
 */
@Injectable()
export class AuditService {
  async record(_event: any): Promise<void> {
    // no-op
  }
  async log(_event: any): Promise<void> {
    // no-op
  }
}
