import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantQueryService } from '../../tenant/tenant-query.service';
import { OverdueFilterDto } from '../dto/payment.dto';

/**
 * Read-only reporting + dashboard KPIs for sales.
 *
 * Most aggregates are plain Prisma `aggregate()` calls; the heavier ones
 * (COGS for completed sales, projected profit on remaining inventory,
 * revenue-per-day timeseries) need raw SQL and go through
 * `TenantQueryService` so they stay tenant-scoped.
 *
 * Period helpers translate `daily | weekly | monthly | yearly` into a
 * concrete `[start, end)` window aligned to the local timezone of the
 * server.
 */
@Injectable()
export class SalesReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantQuery: TenantQueryService,
  ) {}

  /**
   * Dashboard KPIs:
   *  - lifetime total sales / today / month revenue
   *  - pending payments (unpaid + partial remaining balance)
   *  - cash received this month
   *  - total purchases (cost spent on inventory) + remaining supplier liability
   *  - realized profit (revenue - COGS) and net profit (realized - supplier debt)
   *  - projected profit on currently-on-hand stock (if everything sold at price)
   *  - approximate profit (realized + projected)
   */
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
      // total amount spent on RECEIVED purchases (cash spent on inventory)
      totalPurchasesAgg,
      // realized revenue + cost of sold goods (matched, gross-margin profit)
      realizedRevenueAgg,
      realizedCogsRows,
      // unsold inventory at cost vs sale price (projected profit if it sells)
      projectedRows,
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
      this.prisma.purchase.aggregate({
        where: { status: 'RECEIVED' },
        _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: { saleStatus: 'COMPLETED' },
        _sum: { totalAmount: true },
      }),
      // COGS for completed sales: prefer recorded movement.unitCost, fall back
      // to item.purchasePrice when the cost wasn't captured (legacy rows).
      this.tenantQuery.queryRaw<{ cogs: number | null }[]>(
        'sm."companyId"',
        (TENANT) => Prisma.sql`
          SELECT COALESCE(SUM(sm.quantity * COALESCE(sm."unitCost", i."purchasePrice")), 0)::float AS cogs
          FROM stock_movements sm
          JOIN items i ON i.id = sm."itemId"
          JOIN sales s ON s.id = sm."referenceId"
          WHERE ${TENANT}
            AND sm."referenceType" = 'SALE'
            AND sm.type = 'OUT'
            AND s."saleStatus" = 'COMPLETED'
        `,
      ),
      // Projected profit on currently-on-hand stock if everything sold at salePrice.
      this.tenantQuery.queryRaw<{
        unsoldcost: number | null;
        unsoldrevenue: number | null;
      }[]>(
        's."companyId"',
        (TENANT) => Prisma.sql`
          SELECT COALESCE(SUM(s.quantity * i."purchasePrice"), 0)::float AS unsoldcost,
                 COALESCE(SUM(s.quantity * i."salePrice"), 0)::float AS unsoldrevenue
          FROM inventory_stock s
          JOIN items i ON i.id = s."itemId"
          WHERE ${TENANT}
            AND s.quantity > 0
        `,
      ),
    ]);

    const pendingPayments =
      (unpaidSum._sum.remainingAmount ?? 0) +
      (partialSum._sum.remainingAmount ?? 0);

    const totalPurchases = totalPurchasesAgg._sum.totalAmount ?? 0;
    const purchasesPaid = totalPurchasesAgg._sum.paidAmount ?? 0;
    const purchasesRemaining = totalPurchasesAgg._sum.remainingAmount ?? 0;

    const realizedRevenue = realizedRevenueAgg._sum.totalAmount ?? 0;
    const realizedCogs = Number(realizedCogsRows[0]?.cogs ?? 0);
    const realizedProfit = realizedRevenue - realizedCogs;
    // "Net profit" from a cash-flow standpoint: gross margin minus the
    // outstanding supplier liability that still has to be settled.
    const netProfit = realizedProfit - purchasesRemaining;

    const unsoldCost = Number(projectedRows[0]?.unsoldcost ?? 0);
    const unsoldRevenue = Number(projectedRows[0]?.unsoldrevenue ?? 0);
    const projectedProfit = unsoldRevenue - unsoldCost;

    // Best-case profit if every unit currently on hand sells at salePrice.
    const approximateProfit = realizedProfit + projectedProfit;

    return {
      totalSales,
      todayRevenue: todayRevenue._sum.totalAmount ?? 0,
      monthRevenue: monthRevenue._sum.totalAmount ?? 0,
      totalCustomers,
      pendingPayments,
      monthCashReceived: totalPaidMonth._sum.amount ?? 0,
      // New KPIs
      totalPurchases,
      purchasesPaid,
      purchasesRemaining,
      realizedRevenue,
      realizedCogs,
      realizedProfit,
      netProfit,
      unsoldCost,
      unsoldRevenue,
      projectedProfit,
      approximateProfit,
    };
  }

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
    warehouseId?: number,
  ) {
    const { start, end } =
      fromStr && toStr
        ? { start: new Date(fromStr), end: new Date(toStr) }
        : this.getPeriodRange(period);

    // Validate warehouse if provided so the report metadata can echo its name.
    let warehouse: { id: number; name: string } | null = null;
    if (warehouseId) {
      const w = await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true },
      });
      if (w) warehouse = w;
    }

    // Reusable scoping fragment: warehouse filter applied to all sales queries.
    const saleWhere = (
      extra: Prisma.SaleWhereInput = {},
    ): Prisma.SaleWhereInput => ({
      saleStatus: 'COMPLETED',
      ...(warehouseId ? { warehouseId } : {}),
      ...extra,
    });

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
        where: saleWhere({ saleDate: { gte: start, lt: end } }),
        _sum: { totalAmount: true, subtotal: true, discount: true, tax: true },
      }),
      this.prisma.sale.count({
        where: saleWhere({ saleDate: { gte: start, lt: end } }),
      }),
      // Payments are derived from sales — scope via the sale relation when a
      // warehouse filter is active.
      this.prisma.payment.aggregate({
        where: {
          paymentDate: { gte: start, lt: end },
          ...(warehouseId ? { sale: { warehouseId } } : {}),
        },
        _sum: { amount: true },
      }),
      // Purchases don't have a warehouseId column; scope via stock movements
      // that posted IN to this warehouse.
      this.prisma.purchase.aggregate({
        where: {
          status: 'RECEIVED',
          purchaseDate: { gte: start, lt: end },
          ...(warehouseId
            ? {
                movements: {
                  some: {
                    type: 'IN',
                    targetWarehouseId: warehouseId,
                  },
                },
              }
            : {}),
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchase.count({
        where: {
          status: 'RECEIVED',
          purchaseDate: { gte: start, lt: end },
          ...(warehouseId
            ? {
                movements: {
                  some: {
                    type: 'IN',
                    targetWarehouseId: warehouseId,
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.sale.aggregate({
        where: saleWhere({ paymentStatus: { in: ['UNPAID', 'PARTIAL'] } }),
        _sum: { remainingAmount: true },
      }),
      this.prisma.sale.groupBy({
        by: ['paymentStatus'],
        where: saleWhere({ saleDate: { gte: start, lt: end } }),
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['itemId'],
        where: {
          sale: saleWhere({ saleDate: { gte: start, lt: end } }),
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      // Revenue grouped by day (raw SQL for portability). Conditional fragment
      // is interpolated via a scalar to keep parameter binding safe.
      warehouseId
        ? this.tenantQuery.queryRaw<
            { day: Date; revenue: number | null; count: bigint }[]
          >(
            '"companyId"',
            (TENANT) => Prisma.sql`
              SELECT date_trunc('day', "saleDate") AS day,
                     SUM("totalAmount")::float AS revenue,
                     COUNT(*)::bigint AS count
              FROM sales
              WHERE ${TENANT}
                AND "saleStatus" = 'COMPLETED'
                AND "warehouseId" = ${warehouseId}
                AND "saleDate" >= ${start}
                AND "saleDate" < ${end}
              GROUP BY day
              ORDER BY day ASC
            `,
          )
        : this.tenantQuery.queryRaw<
            { day: Date; revenue: number | null; count: bigint }[]
          >(
            '"companyId"',
            (TENANT) => Prisma.sql`
              SELECT date_trunc('day', "saleDate") AS day,
                     SUM("totalAmount")::float AS revenue,
                     COUNT(*)::bigint AS count
              FROM sales
              WHERE ${TENANT}
                AND "saleStatus" = 'COMPLETED'
                AND "saleDate" >= ${start}
                AND "saleDate" < ${end}
              GROUP BY day
              ORDER BY day ASC
            `,
          ),
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
      warehouse,
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
