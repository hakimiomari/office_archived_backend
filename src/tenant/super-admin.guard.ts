import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

/**
 * Single-tenant shim. The original guard restricted endpoints to
 * SUPER_ADMINs (cross-tenant operators). In single-tenant mode every
 * authenticated user reaches the underlying handler; the upstream
 * `AuthGuard` already enforces authentication. Endpoints that need
 * admin-only access should use permission decorators instead.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
