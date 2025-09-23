import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { TokenProvider } from "../providers/token.provider";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenProvider: TokenProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
