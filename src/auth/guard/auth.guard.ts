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
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly reflector: Reflector
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
      request["user"] = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException(err.response.message);
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
