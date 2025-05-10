import { Injectable } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}

  async assignRole(dto: RoleDto) {
    return {
      message: "Role Assigned Successfully",
    };
  }
}
