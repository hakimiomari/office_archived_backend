import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { UserService } from "./user.service";
import { AuthGuard } from "src/auth/guard/auth.guard";
import { Request } from "express";

@Controller("user")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("assign_role")
  async assignRole(@Body() dto: RoleDto) {
    return this.userService.assignRole(dto);
  }

  @UseGuards(AuthGuard)
  @Get("profile")
  async profile(@Req() request: any) {
    return await this.userService.profile(request?.user);
  }
}
