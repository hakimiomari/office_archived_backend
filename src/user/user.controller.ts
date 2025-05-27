import { Body, Controller, Get, Post } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { UserService } from "./user.service";

@Controller("user")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("assign_role")
  async assignRole(@Body() dto: RoleDto) {
    return this.userService.assignRole(dto);
  }
  @Get("profile")
  async profile() {
    console.log("profile is clalled");
    return this.userService.profile();
  }
}
