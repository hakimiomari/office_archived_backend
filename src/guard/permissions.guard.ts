import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
  Type,
} from "@nestjs/common";

export function PermissionsGuard(permission: string): Type<CanActivate> {
  @Injectable()
  class PermissionMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const user = request["user"];
      if (!user || !user.permissions) {
        throw new ForbiddenException("No user or permissions found");
      }

      const hasPermission = user.permissions.includes(permission);
      if (!hasPermission) {
        throw new ForbiddenException("Insufficient permissions");
      }
      return true;
    }
  }
  return mixin(PermissionMixin);
}
