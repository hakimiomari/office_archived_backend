import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CreateUserDto } from "./dto/CreateUserDto.dot";
import { LoginDto } from "./dto/LoginDto.dto";
import { AuthService } from "./auth.service";
import { Request, Response } from "express";
import { AuthGuard } from "./guard/auth.guard";
import { SeedService } from "../../prisma/seed/seed.service";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private seedService: SeedService
  ) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.login(dto, response);
  }

  @Post("register")
  async register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @Get("refresh_token")
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.refreshToken(request, response);
  }

  @UseGuards(AuthGuard)
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
