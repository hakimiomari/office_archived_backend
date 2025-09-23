import { Inject, Injectable } from "@nestjs/common";
import { SignInDto } from "./dto/SignInDto.dto";
import * as bcrypt from "bcrypt";
import { Request, Response } from "express";
import { SignInProvider } from "./providers/sign-in.provider";
import { LogoutProvider } from "./providers/logout.provider";
import { TokenProvider } from "./providers/token.provider";
import { LogoutDto } from "./dto/LogoutDto.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly signInProvider: SignInProvider,
    @Inject()
    private readonly tokenProvider: TokenProvider,
    private readonly logoutProvider: LogoutProvider
  ) {}

  async signIn(dto: SignInDto, response: Response) {
    return await this.signInProvider.signIn(dto, response);
  }

  // update refresh token
  async refreshToken(request: Request, response: Response) {
    return this.tokenProvider.refreshToken(request, response);
  }

  async hashedPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  // logout
  async logout(dto: LogoutDto, response: Response) {
    return await this.logoutProvider.logout(dto.access_token, response);
  }
}
