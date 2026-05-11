import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreateStrict } from '../../tenant/tenant-create';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/supplier.dto';
import { PaginationDto } from '../dto/inventory-filter.dto';

/**
 * Suppliers — sources of incoming inventory. Each supplier carries a
 * running `totalOwed` that is bumped/decremented by purchases and supplier
 * payments respectively (those flows live in PurchasingService).
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: tenantCreateStrict<Prisma.SupplierUncheckedCreateInput>({ ...dto }),
    });
  }

  async findAll(filters: PaginationDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { contact: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { purchases: { take: 10, orderBy: { purchaseDate: 'desc' } } },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return supplier;
  }

  async update(id: number, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.supplier.delete({ where: { id } });
  }
}
