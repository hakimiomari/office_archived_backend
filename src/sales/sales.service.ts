import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerFilterDto,
} from './dto/customer.dto';
import {
  CreateSaleDto,
  UpdateSaleDto,
  SaleFilterDto,
  PaymentStatus,
} from './dto/sale.dto';
import {
  CreatePaymentDto,
  PaymentFilterDto,
  OverdueFilterDto,
} from './dto/payment.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  //                                CUSTOMERS
  // =========================================================================

  async createCustomer(dto: CreateCustomerDto, userId?: string) {
    return this.prisma.customer.create({
      data: { ...dto, createdBy: userId },
    });
  }

  async findAllCustomers(filters: CustomerFilterDto) {
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

  async findOneCustomer(id: number) {
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

  async updateCustomer(id: number, dto: UpdateCustomerDto) {
    await this.findOneCustomer(id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async removeCustomer(id: number) {
    await this.findOneCustomer(id);
    return this.prisma.customer.delete({ where: { id } });
  }

  // =========================================================================
  //                                  SALES
  // =========================================================================

  /** Generate a unique invoice number like INV-20260414-0001 */
  private async generateInvoiceNo(): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const count = await this.prisma.sale.count({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
    });

    return `INV-${datePart}-${String(count + 1).padStart(4, '0')}`;
  }

  async createSale(dto: CreateSaleDto, userId?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    // Compute totals
    const subtotal = dto.items.reduce(
      (sum, li) => sum + li.quantity * li.unitPrice - (li.discount ?? 0),
      0,
    );
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const totalAmount = Math.max(0, subtotal - discount + tax);
    const paidAmount = dto.paidAmount ?? 0;

    if (paidAmount > totalAmount) {
      throw new BadRequestException(
        `Paid amount (${paidAmount}) cannot exceed total (${totalAmount})`,
      );
    }

    const remainingAmount = totalAmount - paidAmount;
    const paymentStatus: PaymentStatus =
      remainingAmount === 0
        ? PaymentStatus.PAID
        : paidAmount > 0
          ? PaymentStatus.PARTIAL
          : PaymentStatus.UNPAID;

    // Validate warehouse
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse)
      throw new BadRequestException(`Warehouse ${dto.warehouseId} not found`);

    // Validate stock levels up-front
    for (const li of dto.items) {
      const stock = await this.prisma.inventoryStock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: li.itemId,
            warehouseId: dto.warehouseId,
          },
        },
        include: { item: true },
      });
      if (!stock || stock.quantity < li.quantity) {
        const itemName = stock?.item.name ?? `Item ${li.itemId}`;
        const available = stock?.quantity ?? 0;
        throw new BadRequestException(
          `Insufficient stock for "${itemName}" in this warehouse. Available: ${available}, requested: ${li.quantity}`,
        );
      }
    }

    const invoiceNo = await this.generateInvoiceNo();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          employeeId: dto.employeeId,
          subtotal,
          discount,
          tax,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentStatus,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          saleStatus: 'COMPLETED',
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes,
          createdBy: userId,
          items: {
            create: dto.items.map((li) => ({
              itemId: li.itemId,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              discount: li.discount ?? 0,
              lineTotal: li.quantity * li.unitPrice - (li.discount ?? 0),
            })),
          },
        },
        include: {
          customer: true,
          items: { include: { item: true } },
        },
      });

      // Decrement stock and create movements
      for (const li of dto.items) {
        await tx.inventoryStock.update({
          where: {
            itemId_warehouseId: {
              itemId: li.itemId,
              warehouseId: dto.warehouseId,
            },
          },
          data: { quantity: { decrement: li.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            itemId: li.itemId,
            type: 'OUT',
            quantity: li.quantity,
            sourceWarehouseId: dto.warehouseId,
            referenceType: 'SALE',
            referenceId: sale.id,
            notes: `Sale ${invoiceNo}`,
          },
        });
      }

      // Record initial payment if any
      if (paidAmount > 0) {
        await tx.payment.create({
          data: {
            saleId: sale.id,
            amount: paidAmount,
            method: dto.paymentMethod ?? 'CASH',
            paymentDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
            employeeId: dto.employeeId,
            createdBy: userId,
          },
        });
      }

      // Update customer total owed if credit
      if (dto.customerId && remainingAmount > 0) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { totalOwed: { increment: remainingAmount } },
        });
      }

      return sale;
    });
  }

  async findAllSales(filters: SaleFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {};
    const AND: Prisma.SaleWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { invoiceNo: { contains: filters.search, mode: 'insensitive' } },
          {
            customer: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    if (filters.customerId) AND.push({ customerId: filters.customerId });
    if (filters.paymentStatus)
      AND.push({ paymentStatus: filters.paymentStatus });
    if (filters.saleStatus) AND.push({ saleStatus: filters.saleStatus });
    if (filters.from || filters.to) {
      AND.push({
        saleDate: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      });
    }

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { saleDate: 'desc' },
        include: {
          customer: true,
          items: { include: { item: true } },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneSale(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        employee: true,
        items: { include: { item: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!sale) throw new NotFoundException(`Sale ${id} not found`);
    return sale;
  }

  async updateSale(id: number, dto: UpdateSaleDto) {
    await this.findOneSale(id);
    return this.prisma.sale.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
      },
    });
  }

  /** Cancel a sale: restore stock, revert customer owed, keep historical record */
  async cancelSale(id: number, userId?: string) {
    const sale = await this.findOneSale(id);
    if (sale.saleStatus === 'CANCELLED') {
      throw new BadRequestException('Sale is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Restore stock
      for (const item of sale.items) {
        await tx.inventoryStock.update({
          where: {
            itemId_warehouseId: {
              itemId: item.itemId,
              warehouseId: sale.warehouseId,
            },
          },
          data: { quantity: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            itemId: item.itemId,
            type: 'IN',
            quantity: item.quantity,
            targetWarehouseId: sale.warehouseId,
            referenceType: 'SALE',
            referenceId: sale.id,
            notes: `Cancelled sale ${sale.invoiceNo}`,
            userId: userId ? Number(userId) || null : null,
          },
        });
      }

      // Revert customer owed
      if (sale.customerId && sale.remainingAmount > 0) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalOwed: { decrement: sale.remainingAmount } },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { saleStatus: 'CANCELLED' },
      });
    });
  }

  async removeSale(id: number) {
    const sale = await this.findOneSale(id);
    // Restore customer owed if applicable
    if (sale.customerId && sale.remainingAmount > 0 && sale.saleStatus === 'COMPLETED') {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { totalOwed: { decrement: sale.remainingAmount } },
      });
    }
    return this.prisma.sale.delete({ where: { id } });
  }

  // =========================================================================
  //                               PAYMENTS
  // =========================================================================

  async createPayment(dto: CreatePaymentDto, userId?: string) {
    const sale = await this.findOneSale(dto.saleId);
    if (sale.saleStatus === 'CANCELLED') {
      throw new BadRequestException('Cannot record payment on a cancelled sale');
    }

    if (dto.amount > sale.remainingAmount) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds remaining balance (${sale.remainingAmount})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          saleId: dto.saleId,
          amount: dto.amount,
          method: dto.method ?? 'CASH',
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          referenceNo: dto.referenceNo,
          notes: dto.notes,
          employeeId: dto.employeeId,
          createdBy: userId,
        },
      });

      const newPaid = sale.paidAmount + dto.amount;
      const newRemaining = sale.totalAmount - newPaid;
      const newStatus: PaymentStatus =
        newRemaining === 0
          ? PaymentStatus.PAID
          : newPaid > 0
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID;

      await tx.sale.update({
        where: { id: dto.saleId },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
        },
      });

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalOwed: { decrement: dto.amount } },
        });
      }

      return payment;
    });
  }

  async findAllPayments(filters: PaymentFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};
    if (filters.saleId) where.saleId = filters.saleId;
    if (filters.method) where.method = filters.method;
    if (filters.from || filters.to) {
      where.paymentDate = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          sale: { include: { customer: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async removePayment(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      const sale = payment.sale;
      const newPaid = Math.max(0, sale.paidAmount - payment.amount);
      const newRemaining = sale.totalAmount - newPaid;
      const newStatus: PaymentStatus =
        newRemaining === 0
          ? PaymentStatus.PAID
          : newPaid > 0
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
        },
      });

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalOwed: { increment: payment.amount } },
        });
      }

      return tx.payment.delete({ where: { id } });
    });
  }

  // =========================================================================
  //                                SUMMARY
  // =========================================================================

  async getSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalSales,
      todayRevenue,
      monthRevenue,
      totalCustomers,
      unpaidSum,
      partialSum,
      totalPaidMonth,
    ] = await Promise.all([
      this.prisma.sale.count({ where: { saleStatus: 'COMPLETED' } }),
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          saleDate: { gte: todayStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          saleDate: { gte: monthStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.customer.count(),
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          paymentStatus: 'UNPAID',
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          paymentStatus: 'PARTIAL',
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: { paymentDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const pendingPayments =
      (unpaidSum._sum.remainingAmount ?? 0) +
      (partialSum._sum.remainingAmount ?? 0);

    return {
      totalSales,
      todayRevenue: todayRevenue._sum.totalAmount ?? 0,
      monthRevenue: monthRevenue._sum.totalAmount ?? 0,
      totalCustomers,
      pendingPayments,
      monthCashReceived: totalPaidMonth._sum.amount ?? 0,
    };
  }

  // =========================================================================
  //                              REPORTS
  // =========================================================================

  /** Compute [start, end) window for the requested period */
  private getPeriodRange(
    period: 'daily' | 'weekly' | 'monthly' | 'yearly',
    anchor: Date = new Date(),
  ): { start: Date; end: Date } {
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (period === 'daily') {
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);
    } else if (period === 'weekly') {
      const day = start.getDay(); // 0=Sun
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else if (period === 'monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
    } else {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setFullYear(end.getFullYear() + 1);
    }
    return { start, end };
  }

  async getReport(
    period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly',
    fromStr?: string,
    toStr?: string,
  ) {
    const { start, end } =
      fromStr && toStr
        ? { start: new Date(fromStr), end: new Date(toStr) }
        : this.getPeriodRange(period);

    const [
      salesAgg,
      salesCount,
      paymentsAgg,
      purchasesAgg,
      purchasesCount,
      pendingAgg,
      byStatus,
      topProducts,
      revenueByDay,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          saleDate: { gte: start, lt: end },
        },
        _sum: { totalAmount: true, subtotal: true, discount: true, tax: true },
      }),
      this.prisma.sale.count({
        where: {
          saleStatus: 'COMPLETED',
          saleDate: { gte: start, lt: end },
        },
      }),
      this.prisma.payment.aggregate({
        where: { paymentDate: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.purchase.aggregate({
        where: {
          status: 'RECEIVED',
          purchaseDate: { gte: start, lt: end },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchase.count({
        where: {
          status: 'RECEIVED',
          purchaseDate: { gte: start, lt: end },
        },
      }),
      this.prisma.sale.aggregate({
        where: {
          saleStatus: 'COMPLETED',
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.sale.groupBy({
        by: ['paymentStatus'],
        where: {
          saleStatus: 'COMPLETED',
          saleDate: { gte: start, lt: end },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['itemId'],
        where: {
          sale: {
            saleStatus: 'COMPLETED',
            saleDate: { gte: start, lt: end },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      // Revenue grouped by day (raw SQL for portability)
      this.prisma.$queryRaw<
        { day: Date; revenue: number | null; count: bigint }[]
      >`
        SELECT date_trunc('day', "saleDate") AS day,
               SUM("totalAmount")::float AS revenue,
               COUNT(*)::bigint AS count
        FROM sales
        WHERE "saleStatus" = 'COMPLETED'
          AND "saleDate" >= ${start}
          AND "saleDate" < ${end}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    // Resolve top product names
    const itemIds = topProducts.map((t) => t.itemId);
    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const revenue = salesAgg._sum.totalAmount ?? 0;
    const expenses = purchasesAgg._sum.totalAmount ?? 0;
    const profit = revenue - expenses;

    return {
      period,
      range: { start, end },
      financial: {
        revenue,
        expenses,
        profit,
        subtotal: salesAgg._sum.subtotal ?? 0,
        discount: salesAgg._sum.discount ?? 0,
        tax: salesAgg._sum.tax ?? 0,
        cashReceived: paymentsAgg._sum.amount ?? 0,
        pendingPayments: pendingAgg._sum.remainingAmount ?? 0,
      },
      counts: {
        salesCount,
        purchasesCount,
      },
      byStatus: byStatus.map((b) => ({
        status: b.paymentStatus,
        count: b._count.id,
        total: b._sum.totalAmount ?? 0,
      })),
      topProducts: topProducts.map((t) => ({
        itemId: t.itemId,
        name: itemMap.get(t.itemId)?.name ?? `Item ${t.itemId}`,
        sku: itemMap.get(t.itemId)?.sku ?? null,
        quantity: t._sum.quantity ?? 0,
        revenue: t._sum.lineTotal ?? 0,
      })),
      revenueTrend: revenueByDay.map((r) => ({
        day: r.day,
        revenue: r.revenue ?? 0,
        count: Number(r.count),
      })),
    };
  }

  /** Build the full customer statement data (optionally filtered by date range) */
  async getCustomerReportData(id: number, from?: string, to?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);

    const fromDate = from ? new Date(from) : undefined;
    // Add 1 day to toDate so it's inclusive
    const toDate = to ? new Date(new Date(to).getTime() + 86400000) : undefined;

    const saleDateFilter =
      fromDate || toDate
        ? {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lt: toDate }),
          }
        : undefined;

    const paymentDateFilter =
      fromDate || toDate
        ? {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lt: toDate }),
          }
        : undefined;

    const [sales, payments, totals] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          customerId: id,
          saleStatus: 'COMPLETED',
          ...(saleDateFilter && { saleDate: saleDateFilter }),
        },
        orderBy: { saleDate: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: {
          sale: { customerId: id },
          ...(paymentDateFilter && { paymentDate: paymentDateFilter }),
        },
        include: { sale: { select: { invoiceNo: true } } },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.sale.aggregate({
        where: {
          customerId: id,
          saleStatus: 'COMPLETED',
          ...(saleDateFilter && { saleDate: saleDateFilter }),
        },
        _sum: {
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
        },
        _count: { id: true },
      }),
    ]);

    return {
      customer,
      range: {
        from: fromDate ?? null,
        to: to ? new Date(to) : null,
      },
      stats: {
        salesCount: totals._count.id,
        totalSpent: totals._sum.totalAmount ?? 0,
        totalPaid: totals._sum.paidAmount ?? 0,
        totalRemaining: totals._sum.remainingAmount ?? 0,
      },
      sales,
      payments: payments.map((p) => ({
        ...p,
        invoiceNo: p.sale?.invoiceNo ?? null,
      })),
    };
  }

  async getOverdueSales(filters: OverdueFilterDto = {}) {
    const now = new Date();
    const where: Prisma.SaleWhereInput = {
      saleStatus: 'COMPLETED',
      paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
    };

    // Default: dueDate in the past. If user provides from/to, use those to
    // filter dueDate instead of the default "< now".
    if (filters.from || filters.to) {
      where.dueDate = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    } else {
      where.dueDate = { lt: now };
    }

    if (filters.customerId) where.customerId = filters.customerId;

    return this.prisma.sale.findMany({
      where,
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
  }
}
