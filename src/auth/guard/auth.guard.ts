import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { TokenProvider } from "../providers/token.provider";
import { ATUH_TYPE_KEY, AuthType } from "../guard/decorators/auth.decorator";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "src/prisma/prisma.service";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authType = this.reflector.getAllAndOverride<AuthType>(ATUH_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (authType === AuthType.None) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = await this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException("No token provided");
    }
    try {
      const payload = await this.tokenProvider.validateToken(token);

      // Re-fetch userRole and companyId from the DB on every request. This
      // guarantees tenant scoping works even when the JWT is stale (issued
      // before multi-tenancy was added, or before the user was promoted /
      // demoted / moved between companies). The extra query is cheap and
      // pays for itself by always being correct.
      //
      // The User model isn't in TENANT_MODELS, so this query is unscoped
      // (we use the underlying base PrismaClient typing for clarity).
      const fresh = await (this.prisma as unknown as PrismaClient).user.findUnique({
        where: { id: Number(payload.sub) },
        select: {
          id: true,
          email: true,
          isActive: true,
          userRole: true,
          companyId: true,
        },
      });
      if (!fresh) {
        throw new UnauthorizedException("User no longer exists");
      }
      if (!fresh.isActive) {
        throw new UnauthorizedException("User is inactive");
      }

      request["user"] = {
        ...payload,
        // Always trust the DB over the JWT for tenancy claims.
        userRole: fresh.userRole,
        companyId: fresh.companyId,
        email: fresh.email,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(err.response?.message ?? "Invalid token");
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException();
    }
    const token = authHeader.split(" ")[1];
    return token;
  }
}
