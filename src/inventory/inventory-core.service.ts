import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Reusable atomic stock primitives shared by inventory and sales services.
 *
 *  - atomicDecrement: conditional UPDATE that fails the row if stock is
 *    insufficient — prevents the read-then-write race that allowed negative
 *    stock under concurrent requests.
 *  - consumeFIFO: subtracts a quantity from the oldest available batches and
 *    returns the per-batch consumption so callers can record cost of goods.
 *  - addBatch: idempotent insert of a new FIFO batch (purchase receive).
 *  - evaluateAlerts: re-evaluates LOW_STOCK / OVERSTOCK / REORDER for an item
 *    after any stock change.
 */
@Injectable()
export class InventoryCoreService {
  private readonly logger = new Logger(InventoryCoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically decrement inventory_stock.quantity. Postgres returns a row
   * count; if zero rows were affected the predicate (quantity >= ?) failed.
   * Bumps the optimistic-locking `version` column.
   */
  async atomicDecrement(
    tx: Prisma.TransactionClient,
    itemId: number,
    warehouseId: number,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) throw new BadRequestException("Quantity must be > 0");
    const updated = await tx.$executeRaw`
      UPDATE inventory_stock
         SET quantity = quantity - ${qty},
             version  = version + 1,
             "updatedAt" = NOW()
       WHERE "itemId" = ${itemId}
         AND "warehouseId" = ${warehouseId}
         AND quantity >= ${qty}
    `;
    if (updated === 0) {
      const stock = await tx.inventoryStock.findUnique({
        where: { itemId_warehouseId: { itemId, warehouseId } },
      });
      throw new BadRequestException(
        `Insufficient stock: have ${stock?.quantity ?? 0}, need ${qty}`,
      );
    }
  }

  /**
   * Increment inventory_stock; creates the row if absent.
   */
  async atomicIncrement(
    tx: Prisma.TransactionClient,
    itemId: number,
    warehouseId: number,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) throw new BadRequestException("Quantity must be > 0");
    await tx.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      update: {
        quantity: { increment: qty },
        version: { increment: 1 },
      },
      create: { itemId, warehouseId, quantity: qty, version: 1 },
    });
  }

  /**
   * Add a batch (FIFO entry). Used when receiving purchases or doing a
   * stock-in adjustment with a known cost.
   */
  async addBatch(
    tx: Prisma.TransactionClient,
    args: {
      itemId: number;
      warehouseId: number;
      quantity: number;
      unitCost?: number;
      receivedAt?: Date;
      expiryDate?: Date | null;
      purchaseId?: number | null;
      batchNo?: string | null;
    },
  ) {
    return tx.inventoryBatch.create({
      data: {
        itemId: args.itemId,
        warehouseId: args.warehouseId,
        quantity: args.quantity,
        unitCost: args.unitCost ?? 0,
        receivedAt: args.receivedAt ?? new Date(),
        expiryDate: args.expiryDate ?? null,
        purchaseId: args.purchaseId ?? null,
        batchNo: args.batchNo ?? null,
      },
    });
  }

  /**
   * Consume `qty` units of an item from the oldest batches in a warehouse.
   * Returns per-batch consumption with the unit cost — callers can use this
   * to compute COGS / profit.
   *
   * Returns an empty array if no batches exist (legacy data); callers should
   * fall back to using purchasePrice as a cost approximation.
   */
  async consumeFIFO(
    tx: Prisma.TransactionClient,
    itemId: number,
    warehouseId: number,
    qty: number,
  ): Promise<{ batchId: number; quantity: number; unitCost: number }[]> {
    if (qty <= 0) return [];
    const batches = await tx.inventoryBatch.findMany({
      where: { itemId, warehouseId, quantity: { gt: 0 } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });

    let remaining = qty;
    const consumed: { batchId: number; quantity: number; unitCost: number }[] =
      [];

    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      await tx.inventoryBatch.update({
        where: { id: b.id },
        data: { quantity: { decrement: take } },
      });
      consumed.push({ batchId: b.id, quantity: take, unitCost: b.unitCost });
      remaining -= take;
    }
    // If batches are unavailable (legacy data), don't block the caller —
    // the atomicDecrement on InventoryStock has already enforced totals.
    return consumed;
  }

  /**
   * Re-evaluate alerts for an item after a stock change. Resolves alerts
   * whose condition no longer holds and opens new ones for new conditions.
   * Idempotent: a second call with the same state is a no-op.
   */
  async evaluateAlerts(
    tx: Prisma.TransactionClient,
    itemId: number,
    warehouseId?: number,
  ): Promise<void> {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) return;

    const totalStock = await tx.inventoryStock
      .aggregate({
        where: { itemId },
        _sum: { quantity: true },
      })
      .then((r) => r._sum.quantity ?? 0);

    const reorderPoint = item.reorderPoint ?? item.minStock;

    // Helper to upsert an alert idempotently
    const ensureOpen = async (
      type: "LOW_STOCK" | "OVERSTOCK" | "REORDER",
      threshold: number | null,
      message: string,
    ) => {
      const existing = await tx.alert.findFirst({
        where: { itemId, type, status: "OPEN" },
      });
      if (existing) {
        await tx.alert.update({
          where: { id: existing.id },
          data: { currentValue: totalStock, message, threshold },
        });
      } else {
        await tx.alert.create({
          data: {
            type,
            status: "OPEN",
            itemId,
            warehouseId: warehouseId ?? null,
            currentValue: totalStock,
            threshold,
            message,
          },
        });
      }
    };

    const resolve = async (type: "LOW_STOCK" | "OVERSTOCK" | "REORDER") => {
      const open = await tx.alert.findMany({
        where: { itemId, type, status: "OPEN" },
      });
      if (open.length === 0) return;
      await tx.alert.updateMany({
        where: { id: { in: open.map((a) => a.id) } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    };

    // LOW_STOCK
    if (totalStock < item.minStock) {
      await ensureOpen(
        "LOW_STOCK",
        item.minStock,
        `${item.name} is below minStock (${totalStock} < ${item.minStock})`,
      );
    } else {
      await resolve("LOW_STOCK");
    }

    // REORDER (treat reorderPoint as a soft warning, separate from min)
    if (totalStock <= reorderPoint && totalStock >= item.minStock) {
      await ensureOpen(
        "REORDER",
        reorderPoint,
        `${item.name} reached reorder point (${totalStock} <= ${reorderPoint})`,
      );
    } else if (totalStock > reorderPoint) {
      await resolve("REORDER");
    }

    // OVERSTOCK
    if (item.maxStock != null && totalStock > item.maxStock) {
      await ensureOpen(
        "OVERSTOCK",
        item.maxStock,
        `${item.name} above maxStock (${totalStock} > ${item.maxStock})`,
      );
    } else {
      await resolve("OVERSTOCK");
    }
  }

  /**
   * Translate Prisma unique constraint errors on idempotencyKey into a
   * 409 — useful for callers that want safe replay semantics.
   */
  isIdempotencyConflict(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      Array.isArray((err.meta as { target?: string[] })?.target) &&
      ((err.meta as { target?: string[] }).target ?? []).includes(
        "idempotencyKey",
      )
    );
  }

  /**
   * If an idempotency key is provided and a movement with that key already
   * exists, return it without performing any side effects. Otherwise return
   * null so the caller proceeds.
   */
  async findIdempotent(
    tx: Prisma.TransactionClient,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) return null;
    return tx.stockMovement.findUnique({ where: { idempotencyKey } });
  }

  /** Wrap a duplicate-idempotency error into a clear 409. */
  raiseIdempotencyConflict(idempotencyKey: string): never {
    throw new ConflictException(
      `Duplicate request: idempotencyKey "${idempotencyKey}" already processed`,
    );
  }
}
