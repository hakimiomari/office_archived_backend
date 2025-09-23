import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { UserService } from "./users.service";
import { AuthGuard } from "src/auth/guard/auth.guard";
import { ApiTags } from "@nestjs/swagger";
import { CreateUserDto } from "./dto/CreateUserDto.dot";

@Controller("user")
@ApiTags("User")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("create")
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

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
