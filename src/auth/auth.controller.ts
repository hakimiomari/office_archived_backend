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
import { AuthService } from "./auth.service";
import { Request, Response } from "express";
import { AuthGuard } from "./guard/auth.guard";
import { SeedService } from "../../prisma/seed.service";
import { PermissionsGuard } from "src/guard/permissions.guard";
import { ApiTags } from "@nestjs/swagger";

@Controller("auth")
@ApiTags("Auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private seedService: SeedService
  ) {}

  @Post("sign-in")
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.signIn(dto, response);
  }

  @Get("refresh_token")
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.refreshToken(request, response);
  }
  @UseGuards(AuthGuard)
  @UseGuards(AuthGuard, PermissionsGuard("read:users"))
  @Get("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.logout(request, response);
  }

  @Post("seed")
  async seed() {
    await this.seedService.seed();
    return {
      message: "Database Seeded successfully",
    };
  }
}
