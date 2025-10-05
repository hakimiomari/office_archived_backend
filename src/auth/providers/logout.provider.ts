import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Response } from "express";
import { RedisService } from "src/redis/redis.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class LogoutProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {}

  async logout(token, response: Response) {
    const decode = this.jwtService.verify(token, {
      secret: this.configService.get("ACCESS_TOKEN_KEY"),
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
