import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SignInDto } from "./dto/SignInDto.dto";
import { RegisterDto } from "./dto/RegisterDto.dto";
import { AuthService } from "./auth.service";
import { Request, Response } from "express";
import { AuthGuard } from "./guard/auth.guard";
import { SeedService } from "../../prisma/seed.service";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RegisterProvider } from "./providers/register.provider";

@Controller("auth")
@ApiTags("Auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private seedService: SeedService,
    private registerProvider: RegisterProvider,
  ) {}

  @Post("sign-in")
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.signIn(dto, response);
  }

  @Post("register")
  @ApiOperation({
    summary:
      "Public self-signup: create a tenant + first admin + Basic subscription, then log them in.",
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.registerProvider.register(dto, response);
  }

  @Get("refresh-token")
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.refreshToken(request, response);
  }
  @UseGuards(AuthGuard)
  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const token = request.cookies["access_token"];
    return this.authService.logout(token, response);
  }

  @Post("seed")
  async seed() {
    await this.seedService.seed();
    return {
      message: "Database Seeded successfully",
    };
  }
}
