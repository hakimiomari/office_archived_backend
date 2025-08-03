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
import { SignInProvider } from "./providers/sign-in.provider";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LogoutProvider } from "./providers/logout.provider";
import { TokenProvider } from "./providers/token.provider";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => UserModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get("access_token"),
        signOptions: {
          expiresIn: configService.get<string>("access_token_expires_in"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SeedService,
    {
      provide: HashingProvider,
      useClass: BcryptProvider,
    },
    SignInProvider,
    LogoutProvider,
    TokenProvider,
  ],
  exports: [
    JwtModule,
    AuthService,
    HashingProvider,
    LogoutProvider,
    TokenProvider,
  ],
})
export class AuthModule {}
