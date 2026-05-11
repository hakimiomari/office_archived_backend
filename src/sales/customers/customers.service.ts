import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreateStrict } from '../../tenant/tenant-create';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerFilterDto,
} from '../dto/customer.dto';

/**
 * Customer CRUD + per-customer summary stats. Tenant scoping is applied
 * automatically by the Prisma extension; service code does not need to add
 * `where: { companyId }`.
 *
 * Per-customer "stats" returned by `findOne` aggregate this customer's
 * COMPLETED sales + most recent 50 payments. Heavier reporting (statement
 * with date range) lives in SalesReportsService.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto, userId?: string) {
    return this.prisma.customer.create({
      // companyId is injected at runtime by the tenant-scoped Prisma extension.
      data: tenantCreateStrict<Prisma.CustomerUncheckedCreateInput>({
        ...dto,
        createdBy: userId,
      }),
    });
  }

  async findAll(filters: CustomerFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { phone: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { saleDate: 'desc' },
          take: 50,
          include: {
            items: { include: { item: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);

    const [totals, payments] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { customerId: id, saleStatus: 'COMPLETED' },
        _sum: {
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
        },
        _count: { id: true },
      }),
      this.prisma.payment.findMany({
        where: { sale: { customerId: id } },
        include: {
          sale: { select: { id: true, invoiceNo: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 50,
      }),
    ]);

    return {
      ...customer,
      stats: {
        salesCount: totals._count.id,
        totalSpent: totals._sum.totalAmount ?? 0,
        totalPaid: totals._sum.paidAmount ?? 0,
        totalRemaining: totals._sum.remainingAmount ?? 0,
      },
      recentPayments: payments,
    };
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.customer.delete({ where: { id } });
  }
}
