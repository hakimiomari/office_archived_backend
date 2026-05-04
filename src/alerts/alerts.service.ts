import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCoreService } from '../inventory/inventory-core.service';
import { AlertFilterDto } from './alerts.dto';

/**
 * Alerts service: storage + dispatch.
 *
 * Storage is the `alerts` table. Dispatch is currently structured-log only —
 * it's the seam where email / Slack / webhook integrations plug in. Each
 * dispatcher takes (alert, item) so adding a channel is a one-liner change in
 * `dispatch()`.
 *
 * The hourly scanner re-evaluates LOW_STOCK / OVERSTOCK / REORDER for every
 * item (in case manual SQL or out-of-band changes bypassed the in-process
 * alert hooks) and surfaces DEAD_STOCK separately, since dead stock is a
 * function of time rather than a single transaction.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
  ) {}

  async findAll(filters: AlertFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AlertWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.itemId) where.itemId = filters.itemId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          item: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async acknowledge(id: number) {
    await this.ensure(id);
    return this.prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
    });
  }

  async resolve(id: number) {
    await this.ensure(id);
    return this.prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  async remove(id: number) {
    await this.ensure(id);
    return this.prisma.alert.delete({ where: { id } });
  }

  /**
   * Re-evaluate every item against its thresholds. Idempotent.
   * Called by the cron + can be triggered manually.
   */
  async scanAll(): Promise<{ scanned: number; opened: number; resolved: number }> {
    const items = await this.prisma.item.findMany({ select: { id: true } });
    let opened = 0;
    let resolved = 0;
    const beforeOpen = await this.prisma.alert.count({
      where: { status: 'OPEN' },
    });

    for (const i of items) {
      await this.prisma.$transaction(async (tx) => {
        await this.core.evaluateAlerts(tx, i.id);
      });
    }

    const afterOpen = await this.prisma.alert.count({
      where: { status: 'OPEN' },
    });
    opened = Math.max(0, afterOpen - beforeOpen);
    resolved = Math.max(0, beforeOpen - afterOpen);

    return { scanned: items.length, opened, resolved };
  }

  /**
   * Detect DEAD_STOCK: items with positive stock and no OUT movement in the
   * last `days` days. Opens an OPEN alert; resolves it once movement returns.
   */
  async scanDeadStock(days = 90): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86400000);
    const candidates = await this.prisma.$queryRaw<
      { id: number; name: string; totalStock: number; lastOutAt: Date | null }[]
    >`
      SELECT i.id, i.name,
             COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0)::float AS "totalStock",
             (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') AS "lastOutAt"
      FROM items i
    `;

    let opened = 0;
    for (const c of candidates) {
      const isDead =
        c.totalStock > 0 &&
        (c.lastOutAt === null || new Date(c.lastOutAt) < cutoff);
      const open = await this.prisma.alert.findFirst({
        where: { itemId: c.id, type: 'DEAD_STOCK', status: 'OPEN' },
      });
      if (isDead && !open) {
        await this.prisma.alert.create({
          data: {
            type: 'DEAD_STOCK',
            status: 'OPEN',
            itemId: c.id,
            currentValue: c.totalStock,
            threshold: days,
            message: `${c.name} has had no OUT movement for ${days}+ days (stock: ${c.totalStock})`,
          } as any,
        });
        opened++;
      } else if (!isDead && open) {
        await this.prisma.alert.update({
          where: { id: open.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
      }
    }
    return opened;
  }

  /**
   * Hourly scanner. Re-evaluates thresholds, scans dead stock weekly-ish (once
   * a day is enough since the time threshold is in days).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    try {
      const scan = await this.scanAll();
      this.logger.debug(
        `Alert scan: scanned=${scan.scanned} opened=${scan.opened} resolved=${scan.resolved}`,
      );
      await this.dispatchOpen();
    } catch (err) {
      this.logger.error('Hourly alert scan failed', err);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyDeadStock() {
    try {
      const opened = await this.scanDeadStock(90);
      this.logger.log(`Dead stock scan: opened ${opened} new alerts`);
    } catch (err) {
      this.logger.error('Dead stock scan failed', err);
    }
  }

  /**
   * Dispatch every OPEN alert that has not yet been dispatched. Currently
   * logs structured events — wire email/Slack/webhook here.
   */
  async dispatchOpen() {
    const open = await this.prisma.alert.findMany({
      where: { status: 'OPEN' },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
    for (const a of open) {
      this.logger.warn(
        `[ALERT ${a.type}] item=${a.item.name} (${a.item.sku ?? '-'}) ` +
          `warehouse=${a.warehouse?.name ?? 'all'} ` +
          `value=${a.currentValue} threshold=${a.threshold}: ${a.message}`,
      );
      // TODO: integrate with email / Slack / webhooks here.
    }
    return { dispatched: open.length };
  }

  private async ensure(id: number) {
    const a = await this.prisma.alert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Alert ${id} not found`);
    return a;
  }
}
