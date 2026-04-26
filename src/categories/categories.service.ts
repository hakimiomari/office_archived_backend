import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryFilterDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) await this.ensure(dto.parentId);
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Category with this name (under the same parent) or slug already exists',
        );
      }
      throw err;
    }
  }

  async findAll(filters: CategoryFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { slug: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.parentId !== undefined) where.parentId = filters.parentId;

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { children: true, items: true } },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Whole tree from roots — handy for the UI dropdown. */
  async tree() {
    const all = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    const byParent = new Map<number | null, typeof all>();
    for (const c of all) {
      const key = c.parentId;
      const list = byParent.get(key) ?? [];
      list.push(c);
      byParent.set(key, list);
    }
    const build = (parentId: number | null): unknown[] =>
      (byParent.get(parentId) ?? []).map((c) => ({
        ...c,
        children: build(c.id),
      }));
    return build(null);
  }

  async findOne(id: number) {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    return c;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.ensure(id);
    if (dto.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }
    if (dto.parentId) {
      // Prevent cycles: walk up the new parent's chain.
      let cursor: number | null = dto.parentId;
      while (cursor) {
        if (cursor === id) {
          throw new BadRequestException(
            'Setting this parent would create a cycle',
          );
        }
        const next = await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = next?.parentId ?? null;
      }
    }
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Conflicting name or slug');
      }
      throw err;
    }
  }

  async remove(id: number) {
    await this.ensure(id);
    return this.prisma.category.delete({ where: { id } });
  }

  private async ensure(id: number) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    return c;
  }
}
