import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreateStrict } from '../../tenant/tenant-create';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from '../dto/warehouse.dto';
import { PaginationDto } from '../dto/inventory-filter.dto';

/**
 * Warehouses (storage locations). The list view enriches each row with
 * `itemCount` and `totalQuantity` aggregated from its inventory_stock rows
 * — cheap because there are typically few warehouses per tenant.
 */
@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: tenantCreateStrict<Prisma.WarehouseUncheckedCreateInput>({ ...dto }),
    });
  }

  async findAll(filters: PaginationDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { location: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { stocks: true },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    const enriched = warehouses.map((w) => ({
      ...w,
      itemCount: w.stocks.length,
      totalQuantity: w.stocks.reduce((sum, s) => sum + s.quantity, 0),
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: { include: { item: true } },
      },
    });
    if (!wh) throw new NotFoundException(`Warehouse ${id} not found`);
    return wh;
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.warehouse.delete({ where: { id } });
  }
}
