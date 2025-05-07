import { Body, Controller, Post, Res } from "@nestjs/common";
import { CreateUserDto } from "./dto/CreateUserDto.dot";
import { LoginDto } from "./dto/LoginDto.dto";
import { AuthService } from "./auth.service";
import { Response } from "express";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

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
}
