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
import { GoogleAuthenticationController } from "./social/google-authentication.controller";
import { GoogleAuthenticationService } from "./social/google-authentication.service";
import googleAuthConfig from "./config/google-auth.config";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule.forFeature(googleAuthConfig),
    forwardRef(() => UserModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get("access_token"),
        signOptions: {
          // `expiresIn` is typed as `ms.StringValue` (branded literal like
          // '15m' | '1d' | …); ConfigService can only return plain string,
          // so we cast at the framework boundary. Runtime is unchanged —
          // `jsonwebtoken` parses the string via `ms()`.
          expiresIn: configService.get<string>("access_token_expires_in") as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, GoogleAuthenticationController],
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
    GoogleAuthenticationService,
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
