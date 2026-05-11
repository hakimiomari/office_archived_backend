import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantQueryService } from '../../tenant/tenant-query.service';

/**
 * Read-only inventory analytics:
 *
 *  - Plain aggregates (current stock, low stock, movement counts, stock
 *    by warehouse) come from straight Prisma queries.
 *  - Heavier reports (monthly usage, dead stock, sales velocity, turnover,
 *    profit-per-product) require raw SQL and go through
 *    `TenantQueryService` so they stay tenant-scoped.
 *  - Reorder suggestions compose velocity + lead time + reorder point
 *    into a single ranked list.
 */
@Injectable()
export class InventoryReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantQuery: TenantQueryService,
  ) {}

  async summary() {
    const [
      itemCount,
      warehouseCount,
      supplierCount,
      totalStock,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.item.count(),
      this.prisma.warehouse.count(),
      this.prisma.supplier.count(),
      this.prisma.inventoryStock.aggregate({ _sum: { quantity: true } }),
      this.tenantQuery.queryRaw<{ count: bigint }[]>(
        'i."companyId"',
        (TENANT) => Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM items i
          WHERE ${TENANT}
            AND COALESCE((
              SELECT SUM(quantity)
              FROM inventory_stock
              WHERE "itemId" = i.id
            ), 0) < i."minStock"
        `,
      ),
    ]);

    return {
      itemCount,
      warehouseCount,
      supplierCount,
      totalQuantity: totalStock._sum.quantity ?? 0,
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
    };
  }

  /** Current stock per item (across all warehouses) */
  async currentStock() {
    const items = await this.prisma.item.findMany({
      include: { stocks: true },
      orderBy: { name: 'asc' },
    });
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      category: i.category,
      minStock: i.minStock,
      totalStock: i.stocks.reduce((sum, s) => sum + s.quantity, 0),
    }));
  }

  /** Items whose total stock is below minStock */
  async lowStock() {
    const all = await this.currentStock();
    return all.filter((i) => i.totalStock < i.minStock);
  }

  /** Movement counts grouped by type */
  async movementCounts() {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['type'],
      _count: { _all: true },
      _sum: { quantity: true },
    });
    return rows.map((r) => ({
      type: r.type,
      count: r._count._all,
      totalQuantity: r._sum.quantity ?? 0,
    }));
  }

  /** Stock per warehouse */
  async byWarehouse() {
    const warehouses = await this.prisma.warehouse.findMany({
      include: {
        stocks: { include: { item: true } },
      },
    });
    return warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      itemCount: w.stocks.length,
      totalQuantity: w.stocks.reduce((sum, s) => sum + s.quantity, 0),
      items: w.stocks.map((s) => ({
        itemId: s.item.id,
        itemName: s.item.name,
        quantity: s.quantity,
      })),
    }));
  }

  /** Monthly OUT usage trend (last 12 months) */
  async monthlyUsage() {
    const rows = await this.tenantQuery.queryRaw<
      { month: Date; total: number }[]
    >(
      '"companyId"',
      (TENANT) => Prisma.sql`
        SELECT DATE_TRUNC('month', "createdAt") AS month,
               SUM(quantity)::float AS total
        FROM stock_movements
        WHERE ${TENANT}
          AND type = 'OUT'
          AND "createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month ASC
      `,
    );
    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      total: Number(r.total),
    }));
  }

  /** Items with no OUT movement in the last `days` days. Default 90. */
  async deadStock(days = 90) {
    const cutoff = new Date(Date.now() - days * 86400000);
    const rows = await this.tenantQuery.queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        totalStock: number;
        lastOutAt: Date | null;
      }[]
    >(
      'i."companyId"',
      (TENANT) => Prisma.sql`
        SELECT i.id, i.name, i.sku,
               COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0)::float AS "totalStock",
               (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') AS "lastOutAt"
        FROM items i
        WHERE ${TENANT}
          AND COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0) > 0
          AND (
            (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') IS NULL
            OR (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') < ${cutoff}
          )
        ORDER BY i.name ASC
      `,
    );
    return rows.map((r) => ({
      ...r,
      daysSinceLastOut: r.lastOutAt
        ? Math.floor(
            (Date.now() - new Date(r.lastOutAt).getTime()) / 86400000,
          )
        : null,
    }));
  }

  /** Sales velocity (units sold per day) over a window. Used for reorder recommendations. */
  async salesVelocity(days = 30) {
    const start = new Date(Date.now() - days * 86400000);
    const rows = await this.tenantQuery.queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        soldQty: number;
        velocityPerDay: number;
      }[]
    >(
      'i."companyId"',
      (TENANT) => Prisma.sql`
        SELECT i.id, i.name, i.sku,
               COALESCE(SUM(sm.quantity), 0)::float AS "soldQty",
               (COALESCE(SUM(sm.quantity), 0) / ${days}::float)::float AS "velocityPerDay"
        FROM items i
        LEFT JOIN stock_movements sm
          ON sm."itemId" = i.id AND sm.type = 'OUT' AND sm."createdAt" >= ${start}
        WHERE ${TENANT}
        GROUP BY i.id, i.name, i.sku
        ORDER BY "soldQty" DESC
      `,
    );
    const fast = rows.filter((r) => r.velocityPerDay > 0).slice(0, 10);
    const slow = [...rows]
      .filter((r) => r.velocityPerDay > 0)
      .sort((a, b) => a.velocityPerDay - b.velocityPerDay)
      .slice(0, 10);
    return { windowDays: days, items: rows, fastMoving: fast, slowMoving: slow };
  }

  /** Inventory turnover rate = COGS / average inventory value, over a window. */
  async turnover(days = 90) {
    const start = new Date(Date.now() - days * 86400000);
    const cogsRow = await this.tenantQuery.queryRaw<{ cogs: number | null }[]>(
      'sm."companyId"',
      (TENANT) => Prisma.sql`
        SELECT COALESCE(SUM(sm.quantity * COALESCE(sm."unitCost", i."purchasePrice")), 0)::float AS cogs
        FROM stock_movements sm
        JOIN items i ON i.id = sm."itemId"
        WHERE ${TENANT}
          AND sm.type = 'OUT' AND sm."createdAt" >= ${start}
      `,
    );
    const invValue = await this.tenantQuery.queryRaw<{ value: number | null }[]>(
      's."companyId"',
      (TENANT) => Prisma.sql`
        SELECT COALESCE(SUM(s.quantity * i."purchasePrice"), 0)::float AS value
        FROM inventory_stock s
        JOIN items i ON i.id = s."itemId"
        WHERE ${TENANT}
      `,
    );
    const cogs = Number(cogsRow[0]?.cogs ?? 0);
    const avgInv = Number(invValue[0]?.value ?? 0);
    const turnoverRate = avgInv > 0 ? cogs / avgInv : 0;
    return {
      windowDays: days,
      cogs,
      avgInventoryValue: avgInv,
      turnoverRate,
      daysOfInventory: turnoverRate > 0 ? days / turnoverRate : null,
    };
  }

  /**
   * Profit per item over a window. Uses recorded movement.unitCost when
   * available, falling back to item.purchasePrice.
   */
  async profitPerProduct(days = 30) {
    const start = new Date(Date.now() - days * 86400000);
    const rows = await this.tenantQuery.queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        unitsSold: number;
        revenue: number;
        cogs: number;
        profit: number;
      }[]
    >(
      'i."companyId"',
      (TENANT) => Prisma.sql`
        SELECT i.id, i.name, i.sku,
               COALESCE(SUM(si.quantity), 0)::float AS "unitsSold",
               COALESCE(SUM(si."lineTotal"), 0)::float AS revenue,
               COALESCE(SUM(si.quantity * COALESCE(
                 (SELECT sm."unitCost" FROM stock_movements sm
                    WHERE sm."referenceType" = 'SALE' AND sm."referenceId" = s.id
                      AND sm."itemId" = si."itemId" AND sm."unitCost" IS NOT NULL
                    LIMIT 1),
                 i."purchasePrice"
               )), 0)::float AS cogs,
               (COALESCE(SUM(si."lineTotal"), 0) - COALESCE(SUM(si.quantity * COALESCE(
                 (SELECT sm."unitCost" FROM stock_movements sm
                    WHERE sm."referenceType" = 'SALE' AND sm."referenceId" = s.id
                      AND sm."itemId" = si."itemId" AND sm."unitCost" IS NOT NULL
                    LIMIT 1),
                 i."purchasePrice"
               )), 0))::float AS profit
        FROM items i
        LEFT JOIN sale_items si ON si."itemId" = i.id
        LEFT JOIN sales s ON s.id = si."saleId"
          AND s."saleStatus" = 'COMPLETED'
          AND s."saleDate" >= ${start}
        WHERE ${TENANT}
          AND s.id IS NOT NULL
        GROUP BY i.id, i.name, i.sku
        ORDER BY profit DESC
      `,
    );
    return { windowDays: days, items: rows };
  }

  /** Reorder recommendations based on velocity, lead time and reorder point. */
  async reorderSuggestions() {
    const items = await this.prisma.item.findMany({
      include: { stocks: true },
    });
    const velocity = await this.salesVelocity(30);
    const velMap = new Map(velocity.items.map((v) => [v.id, v.velocityPerDay]));

    return items
      .map((i) => {
        const totalStock = i.stocks.reduce((s, x) => s + x.quantity, 0);
        const v = velMap.get(i.id) ?? 0;
        const leadTime = i.leadTimeDays ?? 7;
        const trigger =
          i.reorderPoint ?? Math.max(i.minStock, v * leadTime);
        const needsReorder =
          totalStock <= trigger && (v > 0 || totalStock < i.minStock);
        const suggestedQty =
          i.reorderQuantity ??
          Math.max(0, Math.ceil(v * leadTime * 2 - totalStock));
        return {
          id: i.id,
          name: i.name,
          sku: i.sku,
          totalStock,
          velocityPerDay: v,
          leadTimeDays: leadTime,
          reorderPoint: trigger,
          suggestedQuantity: suggestedQty,
          needsReorder,
        };
      })
      .filter((x) => x.needsReorder)
      .sort((a, b) => b.velocityPerDay - a.velocityPerDay);
  }
}
