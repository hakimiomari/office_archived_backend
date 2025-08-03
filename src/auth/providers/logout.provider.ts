import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Response } from "express";
import { RedisService } from "src/redis/redis.service";

@Injectable()
export class LogoutProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService
  ) {}

  async logout(token, response: Response) {
    const decode = this.jwtService.verify(token, {
      secret: process.env.ACCESS_TOKEN_KEY,
    });
    const expiresAt = decode.exp * 1000;
    await this.redisService.setBlackListToken(token, expiresAt);

    response.clearCookie("refresh_token");
    response.clearCookie("access_token");

    return {
      message: "Logged out successfully",
    };
  }
}
