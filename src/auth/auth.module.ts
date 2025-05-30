import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaModule } from "src/prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";
import { RedisModule } from "src/redis/redis.module";
import { SeedService } from "../../prisma/seed.service";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.ACCESS_TOKEN_KEY,
      signOptions: { expiresIn: process.env.ACCESS_TOKEN_EXPIRED_TIME },
    }),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SeedService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
