import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.user?.userRole;
    if (role !== "SUPER_ADMIN") {
      throw new ForbiddenException("SUPER_ADMIN role required");
    }
    return true;
  }
}
