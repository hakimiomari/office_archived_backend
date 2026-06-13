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
 *     `plan_request.review`.
 *
 * Composed with AuthGuard on the controller — AuthGuard runs first
 * and populates `req.user`; this guard reads from there.
 */
@Injectable()
export class PlanRequestReviewerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException("Authentication required");
    }
    if (user.userRole === "SUPER_ADMIN") return true;
    const perms: string[] = user.permissions ?? [];
    if (perms.includes("plan_request.review")) return true;
    throw new ForbiddenException(
      "Reviewer permission required (plan_request.review or SUPER_ADMIN)",
    );
  }
}
