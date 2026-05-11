import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantCreateStrict } from '../../tenant/tenant-create';
import { effectiveCompanyId } from '../../tenant/tenant-context';
import { EventBus } from '../../events/event-bus.service';
import { EVENTS } from '../../events/event-types';
import { InventoryCoreService } from '../inventory-core.service';
import {
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockTransferDto,
} from '../dto/stock-movement.dto';
import { StockMovementFilterDto } from '../dto/inventory-filter.dto';

/**
 * Stock movement primitives — IN / OUT / TRANSFER / ADJUSTMENT.
 *
 * Every operation is wrapped in a `$transaction` so `inventory_stock`,
 * `inventory_batches`, and `stock_movements` cannot drift relative to each
 * other. `InventoryCoreService` provides the atomic decrement / FIFO
 * primitives + the post-movement alert re-evaluation.
 *
 * Idempotency keys passed by clients (typically a sale or external system
 * id) make retries safe — a duplicate request returns the original
 * movement instead of double-counting.
 */
@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
    private readonly events: EventBus,
  ) {}

  /**
   * Post-commit `stock.moved` emit. Centralised so each operation's
   * return-then chain stays short.
   */
  private emitMoved(m: {
    id: number;
    itemId: number;
    type: string;
    quantity: number;
    sourceWarehouseId: number | null;
    targetWarehouseId: number | null;
    referenceType: string | null;
    referenceId: number | null;
  }) {
    const companyId = effectiveCompanyId();
    if (companyId == null) return;
    this.events.emit(EVENTS.STOCK_MOVED, {
      companyId,
      movementId: m.id,
      itemId: m.itemId,
      type: m.type as 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT',
      quantity: m.quantity,
      sourceWarehouseId: m.sourceWarehouseId,
      targetWarehouseId: m.targetWarehouseId,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
    });
  }

  async stockIn(dto: StockInDto, userId?: number) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { item: true, targetWarehouse: true },
      });
      if (existing) return existing;
    }

    try {
      const movement = await this.prisma.$transaction(async (tx) => {
        await this.ensureItem(tx, dto.itemId);
        await this.ensureWarehouse(tx, dto.targetWarehouseId);

        await this.core.atomicIncrement(
          tx,
          dto.itemId,
          dto.targetWarehouseId,
          dto.quantity,
        );

        // Track FIFO batch (cost defaults to item.purchasePrice if not given)
        const item = await tx.item.findUnique({ where: { id: dto.itemId } });
        const unitCost = dto.unitCost ?? item?.purchasePrice ?? 0;
        const batch = await this.core.addBatch(tx, {
          itemId: dto.itemId,
          warehouseId: dto.targetWarehouseId,
          quantity: dto.quantity,
          unitCost,
          batchNo: dto.batchNo ?? null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        });

        const movement = await tx.stockMovement.create({
          data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
            itemId: dto.itemId,
            type: 'IN',
            quantity: dto.quantity,
            unitCost,
            batchId: batch.id,
            targetWarehouseId: dto.targetWarehouseId,
            referenceType: dto.referenceType ?? 'MANUAL',
            referenceId: dto.referenceId,
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes,
            userId: userId ?? null,
          }),
          include: { item: true, targetWarehouse: true },
        });

        await this.core.evaluateAlerts(tx, dto.itemId, dto.targetWarehouseId);
        return movement;
      });
      this.emitMoved(movement);
      return movement;
    } catch (err) {
      if (this.core.isIdempotencyConflict(err) && dto.idempotencyKey) {
        const existing = await this.prisma.stockMovement.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { item: true, targetWarehouse: true },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async stockOut(dto: StockOutDto, userId?: number) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { item: true, sourceWarehouse: true },
      });
      if (existing) return existing;
    }

    try {
      const movement = await this.prisma.$transaction(async (tx) => {
        await this.ensureItem(tx, dto.itemId);
        await this.ensureWarehouse(tx, dto.sourceWarehouseId);

        // Atomic conditional decrement — fails the predicate if insufficient,
        // preventing the read-then-write race that allowed negative stock.
        await this.core.atomicDecrement(
          tx,
          dto.itemId,
          dto.sourceWarehouseId,
          dto.quantity,
        );

        // FIFO consumption from oldest batches; cost is the weighted avg of
        // consumed batches.
        const consumed = await this.core.consumeFIFO(
          tx,
          dto.itemId,
          dto.sourceWarehouseId,
          dto.quantity,
        );
        const totalCost = consumed.reduce(
          (s, c) => s + c.quantity * c.unitCost,
          0,
        );
        const unitCost =
          consumed.length > 0 ? totalCost / dto.quantity : undefined;

        const movement = await tx.stockMovement.create({
          data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
            itemId: dto.itemId,
            type: 'OUT',
            quantity: dto.quantity,
            unitCost: unitCost ?? null,
            batchId: consumed[0]?.batchId ?? null,
            sourceWarehouseId: dto.sourceWarehouseId,
            referenceType: dto.referenceType ?? 'MANUAL',
            referenceId: dto.referenceId,
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes,
            userId: userId ?? null,
          }),
          include: { item: true, sourceWarehouse: true },
        });

        await this.core.evaluateAlerts(tx, dto.itemId, dto.sourceWarehouseId);
        return movement;
      });
      this.emitMoved(movement);
      return movement;
    } catch (err) {
      if (this.core.isIdempotencyConflict(err) && dto.idempotencyKey) {
        const existing = await this.prisma.stockMovement.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { item: true, sourceWarehouse: true },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async stockTransfer(dto: StockTransferDto, userId?: number) {
    if (dto.sourceWarehouseId === dto.targetWarehouseId) {
      throw new BadRequestException(
        'Source and target warehouses must be different',
      );
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      await this.ensureItem(tx, dto.itemId);
      await this.ensureWarehouse(tx, dto.sourceWarehouseId);
      await this.ensureWarehouse(tx, dto.targetWarehouseId);

      // Atomic decrement on source side
      await this.core.atomicDecrement(
        tx,
        dto.itemId,
        dto.sourceWarehouseId,
        dto.quantity,
      );

      // Consume FIFO batches at source; carry the cost to a new batch at target
      const consumed = await this.core.consumeFIFO(
        tx,
        dto.itemId,
        dto.sourceWarehouseId,
        dto.quantity,
      );

      // Recreate a single carry-over batch on the target with weighted-avg
      // cost (preserving FIFO order by setting receivedAt to the oldest
      // consumed batch).
      const totalCost = consumed.reduce(
        (s, c) => s + c.quantity * c.unitCost,
        0,
      );
      const carryUnitCost =
        consumed.length > 0 ? totalCost / dto.quantity : 0;

      await this.core.atomicIncrement(
        tx,
        dto.itemId,
        dto.targetWarehouseId,
        dto.quantity,
      );
      const newBatch = await this.core.addBatch(tx, {
        itemId: dto.itemId,
        warehouseId: dto.targetWarehouseId,
        quantity: dto.quantity,
        unitCost: carryUnitCost,
      });

      const movement = await tx.stockMovement.create({
        data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
          itemId: dto.itemId,
          type: 'TRANSFER',
          quantity: dto.quantity,
          unitCost: carryUnitCost,
          batchId: newBatch.id,
          sourceWarehouseId: dto.sourceWarehouseId,
          targetWarehouseId: dto.targetWarehouseId,
          referenceType: 'TRANSFER',
          notes: dto.notes,
          userId: userId ?? null,
        }),
        include: { item: true, sourceWarehouse: true, targetWarehouse: true },
      });

      await this.core.evaluateAlerts(tx, dto.itemId, dto.sourceWarehouseId);
      await this.core.evaluateAlerts(tx, dto.itemId, dto.targetWarehouseId);
      return movement;
    });
    this.emitMoved(movement);
    return movement;
  }

  async stockAdjustment(dto: StockAdjustmentDto, userId?: number) {
    const movement = await this.prisma.$transaction(async (tx) => {
      await this.ensureItem(tx, dto.itemId);
      await this.ensureWarehouse(tx, dto.warehouseId);

      const current = await tx.inventoryStock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.warehouseId,
          },
        },
      });

      const currentQty = current?.quantity ?? 0;
      const delta = dto.newQuantity - currentQty;

      await tx.inventoryStock.upsert({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.warehouseId,
          },
        },
        update: {
          quantity: dto.newQuantity,
          version: { increment: 1 },
        },
        create: tenantCreateStrict<Prisma.InventoryStockUncheckedCreateInput>({
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          quantity: dto.newQuantity,
          version: 1,
        }),
      });

      // Reconcile FIFO batches with the absolute target. If reducing,
      // consume oldest batches; if increasing, add a new batch at item's
      // purchasePrice as the cost approximation.
      if (delta > 0) {
        const item = await tx.item.findUnique({ where: { id: dto.itemId } });
        await this.core.addBatch(tx, {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          quantity: delta,
          unitCost: item?.purchasePrice ?? 0,
          batchNo: 'ADJUSTMENT',
        });
      } else if (delta < 0) {
        await this.core.consumeFIFO(
          tx,
          dto.itemId,
          dto.warehouseId,
          Math.abs(delta),
        );
      }

      const movement = await tx.stockMovement.create({
        data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
          itemId: dto.itemId,
          type: 'ADJUSTMENT',
          quantity: delta,
          targetWarehouseId: dto.warehouseId,
          referenceType: 'ADJUSTMENT',
          notes: dto.notes,
          userId: userId ?? null,
        }),
      });

      await this.core.evaluateAlerts(tx, dto.itemId, dto.warehouseId);
      return movement;
    });
    this.emitMoved({
      id: movement.id,
      itemId: movement.itemId,
      type: 'ADJUSTMENT',
      quantity: movement.quantity,
      sourceWarehouseId: null,
      targetWarehouseId: dto.warehouseId,
      referenceType: 'ADJUSTMENT',
      referenceId: null,
    });
    return movement;
  }

  async findAll(filters: StockMovementFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};
    const AND: Prisma.StockMovementWhereInput[] = [];

    if (filters.type) AND.push({ type: filters.type });
    if (filters.itemId) AND.push({ itemId: filters.itemId });
    if (filters.warehouseId) {
      AND.push({
        OR: [
          { sourceWarehouseId: filters.warehouseId },
          { targetWarehouseId: filters.warehouseId },
        ],
      });
    }

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: true,
          sourceWarehouse: true,
          targetWarehouse: true,
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async ensureItem(tx: Prisma.TransactionClient, id: number) {
    const item = await tx.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  private async ensureWarehouse(tx: Prisma.TransactionClient, id: number) {
    const wh = await tx.warehouse.findUnique({ where: { id } });
    if (!wh) throw new NotFoundException(`Warehouse ${id} not found`);
    return wh;
  }
}
