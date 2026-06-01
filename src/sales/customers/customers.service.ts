import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreate, tenantCreateStrict } from '../../tenant/tenant-create';
import { getTenantContext } from '../../tenant/tenant-context';
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
    const ctx = getTenantContext();
    const { companyId, ...customerData } = dto;

    // SUPER_ADMIN may pick a target tenant explicitly via `dto.companyId`.
    // For any other role we silently ignore it — their tenant comes from
    // the JWT and the Prisma extension auto-injects it. For a SUPER_ADMIN
    // who hasn't scoped via the CompanySwitcher AND didn't pick a company
    // in the form, fail fast with a clear message instead of letting the
    // extension inject `null` and Prisma complain about a missing FK.
    if (ctx?.userRole === 'SUPER_ADMIN') {
      const scoped = ctx.superAdminFilterCompanyId ?? null;
      const explicit = companyId ?? null;
      const targetCompanyId = explicit ?? scoped;
      if (!targetCompanyId) {
        throw new BadRequestException(
          'Select a company for this customer (or pick one in the company switcher).',
        );
      }
      return this.prisma.customer.create({
        data: tenantCreate<Prisma.CustomerUncheckedCreateInput>({
          ...customerData,
          companyId: targetCompanyId,
          createdBy: userId,
        }),
      });
    }

    // Non-SUPER_ADMIN: companyId comes from the AsyncLocalStorage context.
    return this.prisma.customer.create({
      data: tenantCreateStrict<Prisma.CustomerUncheckedCreateInput>({
        ...customerData,
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
