import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreateStrict } from '../../tenant/tenant-create';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { ItemFilterDto } from '../dto/inventory-filter.dto';

/**
 * Items / SKU master data. Read paths enrich list and detail responses
 * with per-warehouse stock totals + recent movements; the optional
 * `lowStock` filter is applied post-aggregation since it requires the
 * total across all warehouses, not per-row.
 *
 * `(companyId, sku)` is unique at the DB level; a P2002 conflict on create
 * is translated into a 409 with a friendly message.
 */
@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto) {
    try {
      return await this.prisma.item.create({
        data: tenantCreateStrict<Prisma.ItemUncheckedCreateInput>({ ...dto }),
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`SKU "${dto.sku}" already exists`);
      }
      throw err;
    }
  }

  async findAll(filters: ItemFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ItemWhereInput = {};
    const AND: Prisma.ItemWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.category) AND.push({ category: filters.category });

    if (AND.length > 0) where.AND = AND;

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          stocks: { include: { warehouse: true } },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    // Enrich with totalStock across all warehouses; apply low-stock filter if requested
    const enriched = items
      .map((item) => {
        const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
        return { ...item, totalStock };
      })
      .filter((item) =>
        filters.lowStock ? item.totalStock < item.minStock : true,
      );

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        stocks: { include: { warehouse: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            sourceWarehouse: true,
            targetWarehouse: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
    return { ...item, totalStock };
  }

  async update(id: number, dto: UpdateItemDto) {
    await this.findOne(id);
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.item.delete({ where: { id } });
  }
}
