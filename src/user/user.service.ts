import { Injectable, NotFoundException } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
/**
 * Service to handle user-related operations.
 */
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Assign roles to the users
   */
  async assignRole(dto: RoleDto) {
    const role = await this.prismaService.role.findMany({
      where: {
        id: dto.role,
      },
    });
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

  /**
   * Get user profile
   */
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
