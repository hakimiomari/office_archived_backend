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
import { LogoutDto } from "./dto/LogoutDto.dto";

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

  @Get("refresh-token")
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.refreshToken(request, response);
  }
  @UseGuards(AuthGuard)
  @UseGuards(AuthGuard, PermissionsGuard("read:users"))
  @Post("logout")
  async logout(
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.logout(dto, response);
  }

  @Post("seed")
  async seed() {
    await this.seedService.seed();
    return {
      message: "Database Seeded successfully",
    };
  }
}
