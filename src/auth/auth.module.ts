import { forwardRef, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaModule } from "src/prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";
import { RedisModule } from "src/redis/redis.module";
import { SeedService } from "../../prisma/seed.service";
import { HashingProvider } from "./providers/hashing.provider";
import { BcryptProvider } from "./providers/bcrypt.provider";
import { UserModule } from "src/users/users.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.ACCESS_TOKEN_KEY,
      signOptions: { expiresIn: process.env.ACCESS_TOKEN_EXPIRED_TIME },
    }),
    RedisModule,
    forwardRef(() => UserModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SeedService,
    {
      provide: HashingProvider,
      useClass: BcryptProvider,
    },
  ],
  exports: [JwtModule, AuthService, HashingProvider],
})
export class AuthModule {}
