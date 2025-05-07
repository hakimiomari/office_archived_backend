import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LoginDto } from "./dto/LoginDto.dto";
import { CreateUserDto } from "./dto/CreateUserDto.dot";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginDto, response: Response) {
    const user = await this.getUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException("Invalid Credentials");
    }

    const password = await bcrypt.compare(dto.password, user.password);
    if (!password) {
      throw new NotFoundException("Invalid Credentials");
    }

    const { access_token, refresh_token } = await this.getTokens(
      user.id,
      user.email
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
    const newUser = await this.prisma.users.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: password,
      },
    });

    const { access_token, refresh_token } = await this.getTokens(
      newUser.id,
      newUser.email
    );

    this.updateRefreshToken(newUser.id, refresh_token);

    return {
      access_token,
      refresh_token,
    };
  }

  async getUserByEmail(email: string) {
    return await this.prisma.users.findUnique({
      where: {
        email: email,
      },
    });
  }

  async updateRefreshToken(userId: number, refresh_token: string) {
    return await this.prisma.users.update({
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

    const { sub, email } = await this.jwtService.verifyAsync(refresh_token, {
      secret: process.env.REFRESH_TOKEN_KEY,
    });

    const user = await this.prisma.users.findUnique({
      where: {
        email: email,
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const { access_token, refresh_token: new_refresh_token } =
      await this.getTokens(user.id, user.email);

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

  async getTokens(userId: number, email: string): Promise<Tokens> {
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: process.env.ACCESS_TOKEN_KEY,
          expiresIn: process.env.ACCESS_TOKEN_EXPIRED_TIME,
        }
      ),

      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: process.env.REFRESH_TOKEN_KEY,
          expiresIn: process.env.REFRESH_TOKEN_EXPIRED_TIME,
        }
      ),
    ]);
    return { access_token, refresh_token };
  }
}
