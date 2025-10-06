import { Body, Controller, Post, Res } from "@nestjs/common";
import { GoogleTokenDto } from "./dto/google-token.dto";
import { GoogleAuthenticationService } from "./google-authentication.service";
import { Auth, AuthType } from "../guard/decorators/auth.decorator";
import { Response } from "express";

@Auth(AuthType.None)
@Controller("google-authentication")
export class GoogleAuthenticationController {
  constructor(
    private readonly googleAuthenticationService: GoogleAuthenticationService
  ) {}

  @Post("google-login")
  async googleLogin(
    @Body() googleTokenDto: GoogleTokenDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return await this.googleAuthenticationService.authentication(
      googleTokenDto,
      response
    );
  }
}
