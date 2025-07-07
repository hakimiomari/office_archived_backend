import { Injectable, NotFoundException } from "@nestjs/common";
import { RoleDto } from "./dto/RoleDto.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/CreateUserDto.dot";
import { CreateUserProvider } from "./providers/create-user.provider";
import { FindOneUserByEmailProvider } from "./providers/find-one-user-by-email.provider";

@Injectable()
/**
 * Service to handle user-related operations.
 */
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly createUserProvider: CreateUserProvider,
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider
  ) {}

  /** Register a new user */
  async createUser(createUserDto: CreateUserDto) {
    return this.createUserProvider.create(createUserDto);
  }
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

  async findOneByEmail(email: string) {
    return await this.findOneUserByEmailProvider.findOneUserByEmail(email);
  }
}
