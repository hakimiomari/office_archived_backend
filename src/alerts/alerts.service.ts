import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCoreService } from '../inventory/inventory-core.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantQueryService } from '../tenant/tenant-query.service';
import { TenantLogger } from '../tenant/tenant-logger';
import { tenantCreateStrict } from '../tenant/tenant-create';
import { EventBus } from '../events/event-bus.service';
import { EVENTS } from '../events/event-types';
import { effectiveCompanyId } from '../tenant/tenant-context';
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
  private readonly logger = new TenantLogger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
    private readonly tenants: TenantService,
    private readonly tenantQuery: TenantQueryService,
    private readonly events: EventBus,
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
    const candidates = await this.tenantQuery.queryRaw<
      { id: number; name: string; totalStock: number; lastOutAt: Date | null }[]
    >(
      'i."companyId"',
      (TENANT) => Prisma.sql`
        SELECT i.id, i.name,
               COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0)::float AS "totalStock",
               (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') AS "lastOutAt"
        FROM items i
        WHERE ${TENANT}
      `,
    );

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
          data: tenantCreateStrict<Prisma.AlertUncheckedCreateInput>({
            type: 'DEAD_STOCK',
            status: 'OPEN',
            itemId: c.id,
            currentValue: c.totalStock,
            threshold: days,
            message: `${c.name} has had no OUT movement for ${days}+ days (stock: ${c.totalStock})`,
          }),
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
   * Hourly scanner. Re-evaluates thresholds for every tenant in isolation, so
   * a slow or failing tenant does not block the others. Each iteration runs
   * inside a tenant context so Prisma's tenant extension scopes queries to
   * that one company — without that, scanAll() would walk every item across
   * every tenant in one giant pass.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    const summary = await this.tenants.forEachCompany(async (companyId) => {
      const scan = await this.scanAll();
      const dispatched = await this.dispatchOpen();
      return { companyId, ...scan, dispatched: dispatched.dispatched };
    });
    this.logger.debug(
      `Hourly alert scan: tenants=${summary.total} succeeded=${summary.succeeded} failed=${summary.failed}`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyDeadStock() {
    const summary = await this.tenants.forEachCompany(async () => {
      return this.scanDeadStock(90);
    });
    this.logger.log(
      `Dead stock scan: tenants=${summary.total} succeeded=${summary.succeeded} failed=${summary.failed}`,
    );
  }

  /**
   * Dispatch every OPEN alert that hasn't been dispatched yet. Emits
   * `alert.triggered` for each, then stamps `dispatchedAt` so future
   * cron runs skip it. The notifications module (§5.3) subscribes to
   * `alert.triggered` and routes to log / webhook / future channels —
   * this method owns idempotency, the listeners own delivery.
   *
   * If an alert is resolved and re-opens later (e.g. stock dips below
   * minStock again), the row's `dispatchedAt` should be cleared by
   * `evaluateAlerts` so a fresh notification fires. We accept the v1
   * limitation that this isn't yet wired — re-opens currently don't
   * re-notify.
   */
  async dispatchOpen() {
    const open = await this.prisma.alert.findMany({
      where: { status: 'OPEN', dispatchedAt: null },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
    const companyId = effectiveCompanyId();
    for (const a of open) {
      this.logger.warn(
        `[ALERT ${a.type}] item=${a.item.name} (${a.item.sku ?? '-'}) ` +
          `warehouse=${a.warehouse?.name ?? 'all'} ` +
          `value=${a.currentValue} threshold=${a.threshold}: ${a.message}`,
      );
      if (companyId != null) {
        this.events.emit(EVENTS.ALERT_TRIGGERED, {
          companyId,
          alertId: a.id,
          alertType: a.type,
          itemId: a.itemId,
          warehouseId: a.warehouseId,
          currentValue: a.currentValue,
          threshold: a.threshold,
        });
      }
      await this.prisma.alert.update({
        where: { id: a.id },
        data: { dispatchedAt: new Date() },
      });
    }
    return { dispatched: open.length };
  }

  private async ensure(id: number) {
    const a = await this.prisma.alert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Alert ${id} not found`);
    return a;
  }
}
