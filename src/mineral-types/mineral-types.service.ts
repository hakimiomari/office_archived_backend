import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMineralTypeDto } from './dto/create-mineral-type.dto';
import { UpdateMineralTypeDto } from './dto/update-mineral-type.dto';

@Injectable()
export class MineralTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMineralTypeDto) {
    try {
      return await this.prisma.mineralType.create({ data: dto });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A mineral type with this name already exists',
        );
      }
      throw e;
    }
  }

  async findAll(page = 1, limit = 100, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.mineralType.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.mineralType.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const mineral = await this.prisma.mineralType.findUnique({
      where: { id },
    });
    if (!mineral) {
      throw new NotFoundException(`Mineral type with id ${id} not found`);
    }
    return mineral;
  }

  async update(id: string, dto: UpdateMineralTypeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.mineralType.update({
        where: { id },
        data: dto,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A mineral type with this name already exists',
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.mineralType.delete({ where: { id } });
    return { message: 'Mineral type deleted successfully' };
  }
}
