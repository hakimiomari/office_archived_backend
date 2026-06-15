import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

/**
 * Allows the request through when the caller is either:
 *   - SUPER_ADMIN, or
 *   - any authenticated user whose JWT permissions array contains
 *     `plan.update`.
 *
 * Use this on PATCH /admin/plans/:id and the plan list/detail GETs so
 * non-super-admin staff can change plan descriptions and prices from
 * /admin/plans. Plan create/delete + module/feature/limit edits remain
 * SUPER_ADMIN-only via SuperAdminGuard.
 */
@Injectable()
export class PlanEditorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException("Authentication required");
    if (user.userRole === "SUPER_ADMIN") return true;
    const perms: string[] = user.permissions ?? [];
    if (perms.includes("plan.update")) return true;
    throw new ForbiddenException(
      "Plan editor permission required (plan.update or SUPER_ADMIN)",
    );
  }
}
