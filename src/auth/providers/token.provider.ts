import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { RedisService } from "src/redis/redis.service";
import { UserService } from "src/users/users.service";
import { ConfigService } from "@nestjs/config";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class TokenProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService
  ) {}

  async getTokens(
    userId: number,
    email: string,
    roles: string | string[],
    permissions: any[],
    userRole: 'ADMIN' | 'USER' = 'USER',
  ): Promise<Tokens> {
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    const permissionNames = permissions.map((p) => p.name);

    const payload = {
      sub: userId,
      email,
      roles: rolesArray,
      role: rolesArray[0], // backward compat
      permissions: permissionNames,
      userRole,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("ACCESS_TOKEN_KEY"),
        expiresIn: this.configService.get("ACCESS_TOKEN_EXPIRED_TIME"),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("REFRESH_TOKEN_KEY"),
        expiresIn: this.configService.get("REFRESH_TOKEN_EXPIRED_TIME"),
      }),
    ]);
    return { access_token, refresh_token };
  }

  // refresh token
  async refreshToken(request: Request, response: Response) {
    const refresh_token = request.cookies["refresh_token"];
    if (!refresh_token) {
      throw new UnauthorizedException("Refresh token is missing");
    }
    const isTokenBlackListed =
      await this.redisService.isTokenBlackListed(refresh_token);

    if (isTokenBlackListed) {
      throw new UnauthorizedException("Refresh token is blacklisted");
    }

    const { email } = await this.jwtService.verifyAsync(refresh_token, {
      secret: this.configService.get("REFRESH_TOKEN_KEY"),
    });

    const user = await this.userService.findOneByEmail(email);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    const allPermissions = user.roles.flatMap((r: any) => r.permissions);
    const uniquePermissions = [
      ...new Map(allPermissions.map((p: any) => [p.name, p])).values(),
    ];
    const roles = user.roles.map((r: any) => r.name);
    const { access_token, refresh_token: new_refresh_token } =
      await this.getTokens(
        user.id,
        user.email,
        roles,
        uniquePermissions,
        user.userRole ?? 'USER',
      );

    response.cookie("refresh_token", new_refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24 * 15,
      path: "/",
    });

    response.cookie("access_token", access_token, {
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    });

    const filteredUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      profile_picture: user.profile_picture,
    };

    return {
      access_token,
      user: filteredUser,
    };
  }

  // validate token
  async validateToken(token: string) {
    const isBlackListed = await this.redisService.isTokenBlackListed(token);
    if (isBlackListed) {
      throw new UnauthorizedException("Token is blacklisted");
    }
    return this.jwtService.verifyAsync(token, {
      secret: this.configService.get("ACCESS_TOKEN_KEY"),
    });
  }
}
