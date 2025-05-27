import { Injectable } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}

  async assignRole(dto: RoleDto) {
    const role = await this.prismaService.role.findMany({
      where: {
        id: dto.role,
      },
    });
    console.log(role);
    const user = await this.prismaService.user.update({
      where: {
        id: dto.userId,
      },
      data: {
        roles: {
          connect: role.map((role) => ({ id: role.id })),
        },
      },
    });
    return {
      message: "Role Assigned Successfully",
    };
  }

  async profile() {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: 1,
      },
    });
    return {
      user,
    };
  }
}
