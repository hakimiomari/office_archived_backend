import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { SignInDto } from "./dto/SignInDto.dto";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { RedisService } from "src/redis/redis.service";
import { SignInProvider } from "./providers/sign-in.provider";
import { UserService } from "src/users/users.service";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly signInProvider: SignInProvider,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService
  ) {}

  async signIn(dto: SignInDto, response: Response) {
    return await this.signInProvider.signIn(dto, response);
  }

  async updateRefreshToken(userId: number, refresh_token: string | null) {
    return await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refresh_token,
      },
    });
  }

  // update refresh token
  async refreshToken(request: Request, response: Response) {
    const refresh_token = request.cookies["refresh_token"];
    if (!refresh_token) {
      throw new UnauthorizedException("Refresh token not found");
    }

    const { email } = await this.jwtService.verifyAsync(refresh_token, {
      secret: process.env.REFRESH_TOKEN_KEY,
    });

    const user = await this.userService.findOneByEmail(email);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    const permissions = user.roles[0].permissions;
    const role = user.roles[0].name;
    const { access_token, refresh_token: new_refresh_token } =
      await this.getTokens(user.id, user.email, role, permissions);

    // update refresh token
    this.updateRefreshToken(user.id, new_refresh_token);

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

  async hashedPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  async getTokens(
    userId: number,
    email: string,
    role: string,
    permissions
  ): Promise<Tokens> {
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
          permissions: permissions.map((permission) => permission.name),
        },
        {
          secret: process.env.ACCESS_TOKEN_KEY,
          expiresIn: process.env.ACCESS_TOKEN_EXPIRED_TIME,
        }
      ),

      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
          permissions: permissions.map((permission) => permission.name),
        },
        {
          secret: process.env.REFRESH_TOKEN_KEY,
          expiresIn: process.env.REFRESH_TOKEN_EXPIRED_TIME,
        }
      ),
    ]);
    return { access_token, refresh_token };
  }

  // logout
  async logout(request: Request, response: Response) {
    const token = await this.extractTokenFromHeader(request);

    if (token) {
      const decode = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY,
      });
      await this.updateRefreshToken(decode.sub, null);
      const expiresAt = decode.exp * 1000;
      await this.redisService.setBlackListToken(token, expiresAt);
    }
    response.clearCookie("refresh_token");
    response.clearCookie("access_token");

    return {
      message: "Logged out successfully",
    };
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.split(" ")[1]; // Extract token from "Bearer <token>"
    }
    return null;
  }

  // validate token
  async validateToken(token: string) {
    const isBlackListed = await this.redisService.isTokenBlackListed(token);
    if (isBlackListed) {
      throw new UnauthorizedException("Token is blacklisted");
    }
    return this.jwtService.verifyAsync(token, {
      secret: process.env.ACCESS_TOKEN_KEY,
    });
  }
}
