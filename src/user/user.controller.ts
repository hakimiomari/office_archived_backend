import { Body, Controller, Post } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { UserService } from "./user.service";

@Controller("user")
export class UserController {
  constructor(private useService: UserService) {}

  @Post("assign_role")
  async assignRole(@Body() dto: RoleDto) {
    return this.useService.assignRole(dto);
  }
}
