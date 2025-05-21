import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { LoginDto } from "./dto/LoginDto.dto";
import { CreateUserDto } from "./dto/CreateUserDto.dot";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { RedisService } from "src/redis/redis.service";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService
  ) {}

  async login(dto: LoginDto, response: Response) {
    const user = await this.getUserByEmail(dto.email);
    if (!user) {
      throw new ForbiddenException("Invalid Credentials");
    }

    const password = await bcrypt.compare(dto.password, user.password);
    if (!password) {
      throw new ForbiddenException("Invalid Credentials");
    }

    const permissions = user.roles[0].permissions;
    const role = user.roles[0].name;
    const { access_token, refresh_token } = await this.getTokens(
      user.id,
      user.email,
      role,
      permissions
    );

    this.updateRefreshToken(user.id, refresh_token);

    response.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24 * 15,
      path: "/",
    });

    return {
      access_token,
    };
  }

  async register(dto: CreateUserDto) {
    const user = await this.getUserByEmail(dto.email);
    if (user) {
      throw new ConflictException("User already exists");
    }

    const password = await this.hashedPassword(dto.password);
    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: password,
        roles: {
          connect: [{ id: dto.role }],
        },
      },
    });

    const permissions = [];
    const role = "admin";
    const { access_token, refresh_token } = await this.getTokens(
      newUser.id,
      newUser.email,
      role,
      permissions
    );

    this.updateRefreshToken(newUser.id, refresh_token);

    return {
      access_token,
      refresh_token,
    };
  }

  async getUserByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: {
        email: email,
      },
      include: {
        roles: {
          include: {
            permissions: true,
          },
        },
      },
    });
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
      throw new NotFoundException("Refresh token not found");
    }

    const { email } = await this.jwtService.verifyAsync(refresh_token, {
      secret: process.env.REFRESH_TOKEN_KEY,
    });

    const user = await this.prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const permissions = [];
    const role = "admin";
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

    return {
      access_token,
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
