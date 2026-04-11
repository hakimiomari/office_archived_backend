import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RoleDto } from './dto/RoleDto.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/CreateUserDto.dot';
import { UpdateUserDto } from './dto/UpdateUserDto.dto';
import { ChangePasswordDto } from './dto/ChangePasswordDto.dto';
import { CreateUserProvider } from './providers/create-user.provider';
import { FindOneUserByEmailProvider } from './providers/find-one-user-by-email.provider';
import { FindOneByGoogleIdProvider } from './providers/find-one-by-google-id.provider';
import { CrcreateGoogleUserProvider } from './providers/crcreate-google-user.provider';
import { GoogleUserInterface } from './interfaces/google-user.interface';
import { HashingProvider } from 'src/auth/providers/hashing.provider';
import { MinioService } from 'src/minio/minio.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly createUserProvider: CreateUserProvider,
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider,
    private readonly findOneByGoogleIdProvider: FindOneByGoogleIdProvider,
    private readonly crcreateGoogleUserProvider: CrcreateGoogleUserProvider,
    private readonly hashingProvider: HashingProvider,
    private readonly minioService: MinioService,
  ) {}

  /** Register a new user */
  async createUser(createUserDto: CreateUserDto) {
    return this.createUserProvider.create(createUserDto);
  }

  /** List all users with pagination and search */
  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          profile_picture: true,
          googleId: true,
          created_at: true,
          updated_at: true,
          roles: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prismaService.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Get single user by ID */
  async findOne(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        profile_picture: true,
        googleId: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: { id: true, name: true, group_name: true, label: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  /** Update user */
  async updateUser(id: number, dto: UpdateUserDto) {
    await this.findOne(id);

    // Check email uniqueness if changing email
    if (dto.email) {
      const existing = await this.prismaService.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException('Email already in use by another user');
      }
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.profile_picture !== undefined)
      data.profile_picture = dto.profile_picture;

    // Handle role update
    if (dto.roleIds !== undefined) {
      data.roles = {
        set: dto.roleIds.map((roleId) => ({ id: roleId })),
      };
    }

    return this.prismaService.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        profile_picture: true,
        created_at: true,
        updated_at: true,
        roles: { select: { id: true, name: true } },
      },
    });
  }

  /** Delete user */
  async deleteUser(id: number) {
    await this.findOne(id);
    await this.prismaService.user.delete({ where: { id } });
    return { message: 'User deleted successfully' };
  }

  /** Change password */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.password) {
      throw new BadRequestException(
        'Cannot change password for Google-authenticated accounts',
      );
    }

    const isMatch = await this.hashingProvider.verifyPassword(
      dto.currentPassword,
      user.password,
    );
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await this.hashingProvider.hashPassword(
      dto.newPassword,
    );
    await this.prismaService.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  /** Assign roles to user */
  async assignRole(dto: RoleDto) {
    const role = await this.prismaService.role.findMany({
      where: { id: dto.role },
    });
    await this.prismaService.user.update({
      where: { id: dto.userId },
      data: {
        roles: {
          connect: role.map((r) => ({ id: r.id })),
        },
      },
    });
    return { message: 'Role Assigned Successfully' };
  }

  /** Get user profile */
  async profile(arg: any) {
    const user = await this.prismaService.user.findUnique({
      where: { email: arg.email },
      select: {
        id: true,
        name: true,
        email: true,
        profile_picture: true,
        googleId: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: { id: true, name: true, group_name: true, label: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { user };
  }

  /** Upload profile picture */
  async uploadProfilePicture(userId: number, file: Express.Multer.File) {
    await this.findOne(userId);
    const { url } = await this.minioService.upload(file, 'profile-pictures');
    return this.prismaService.user.update({
      where: { id: userId },
      data: { profile_picture: url },
      select: {
        id: true,
        name: true,
        email: true,
        profile_picture: true,
      },
    });
  }

  async findOneByEmail(email: string) {
    return await this.findOneUserByEmailProvider.findOneUserByEmail(email);
  }

  async findOneByGoogleId(googleId: any) {
    return await this.findOneByGoogleIdProvider.findOneByGoogleId(googleId);
  }

  async createGoogleUser(googleUser: GoogleUserInterface) {
    return await this.crcreateGoogleUserProvider.createGoogleUser(googleUser);
  }
}
