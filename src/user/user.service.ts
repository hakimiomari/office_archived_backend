import { Injectable, NotFoundException } from "@nestjs/common";
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

  async profile(arg) {
    const user = await this.prismaService.user.findUnique({
      where: {
        email: arg.email,
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return {
      user,
    };
  }
}
