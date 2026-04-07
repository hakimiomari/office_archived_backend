import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto, createdBy: number) {
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Role "${dto.name}" already exists`);
    }

    return this.prisma.role.create({
      data: {
        name: dto.name,
        created_by: createdBy,
        ...(dto.permissionIds && {
          permissions: {
            connect: dto.permissionIds.map((id) => ({ id })),
          },
        }),
      },
      include: {
        permissions: { select: { id: true, name: true, group_name: true, label: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { select: { id: true, name: true, group_name: true, label: true } },
        _count: { select: { users: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { id: true, name: true, group_name: true, label: true } },
        users: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    return role;
  }

  async update(id: number, dto: UpdateRoleDto) {
    await this.findOne(id);

    if (dto.name) {
      const existing = await this.prisma.role.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException(`Role "${dto.name}" already exists`);
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.permissionIds !== undefined && {
          permissions: {
            set: dto.permissionIds.map((pid) => ({ id: pid })),
          },
        }),
      },
      include: {
        permissions: { select: { id: true, name: true, group_name: true, label: true } },
      },
    });
  }

  async delete(id: number) {
    const role = await this.findOne(id);
    if (role.users.length > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" because it has ${role.users.length} assigned users`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role deleted successfully' };
  }

  /** Get all permissions (for role assignment UI) */
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ group_name: 'asc' }, { name: 'asc' }],
    });
  }
}
