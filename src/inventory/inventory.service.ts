import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { CreateWarehouseDto, UpdateWarehouseDto } from "./dto/warehouse.dto";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto/supplier.dto";
import {
  StockInDto,
  StockOutDto,
  StockTransferDto,
  StockAdjustmentDto,
} from "./dto/stock-movement.dto";
import {
  CreatePurchaseDto,
  UpdatePurchaseDto,
  PurchaseStatus,
  CreateSupplierPaymentDto,
  SupplierPaymentFilterDto,
} from "./dto/purchase.dto";
import {
  ItemFilterDto,
  PaginationDto,
  StockMovementFilterDto,
  PurchaseFilterDto,
} from "./dto/inventory-filter.dto";
import { InventoryCoreService } from "./inventory-core.service";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
  ) {}

  // =========================================================================
  //                                 ITEMS
  // =========================================================================

  async createItem(dto: CreateItemDto) {
    try {
      return await this.prisma.item.create({ data: dto });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictException(`SKU "${dto.sku}" already exists`);
      }
      throw err;
    }
  }

  async findAllItems(filters: ItemFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ItemWhereInput = {};
    const AND: Prisma.ItemWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { sku: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }
    if (filters.category) AND.push({ category: filters.category });

    if (AND.length > 0) where.AND = AND;

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          stocks: { include: { warehouse: true } },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    // Enrich with totalStock across all warehouses; apply low-stock filter if requested
    const enriched = items
      .map((item) => {
        const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
        return { ...item, totalStock };
      })
      .filter((item) =>
        filters.lowStock ? item.totalStock < item.minStock : true,
      );

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneItem(id: number) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        stocks: { include: { warehouse: true } },
        movements: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            sourceWarehouse: true,
            targetWarehouse: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
    return { ...item, totalStock };
  }

  async updateItem(id: number, dto: UpdateItemDto) {
    await this.findOneItem(id);
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async removeItem(id: number) {
    await this.findOneItem(id);
    return this.prisma.item.delete({ where: { id } });
  }

  // =========================================================================
  //                               WAREHOUSES
  // =========================================================================

  async createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async findAllWarehouses(filters: PaginationDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { location: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { stocks: true },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    const enriched = warehouses.map((w) => ({
      ...w,
      itemCount: w.stocks.length,
      totalQuantity: w.stocks.reduce((sum, s) => sum + s.quantity, 0),
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneWarehouse(id: number) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: { include: { item: true } },
      },
    });
    if (!wh) throw new NotFoundException(`Warehouse ${id} not found`);
    return wh;
  }

  async updateWarehouse(id: number, dto: UpdateWarehouseDto) {
    await this.findOneWarehouse(id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async removeWarehouse(id: number) {
    await this.findOneWarehouse(id);
    return this.prisma.warehouse.delete({ where: { id } });
  }

  // =========================================================================
  //                                SUPPLIERS
  // =========================================================================

  async createSupplier(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async findAllSuppliers(filters: PaginationDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { contact: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneSupplier(id: number) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { purchases: { take: 10, orderBy: { purchaseDate: "desc" } } },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return supplier;
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto) {
    await this.findOneSupplier(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async removeSupplier(id: number) {
    await this.findOneSupplier(id);
    return this.prisma.supplier.delete({ where: { id } });
  }

  // =========================================================================
  //                            STOCK OPERATIONS
  // All wrapped in a transaction to keep inventory_stock and
  // stock_movements in sync atomically.
  // =========================================================================

  async stockIn(dto: StockInDto, userId?: number) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { item: true, targetWarehouse: true },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
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
          data: {
            itemId: dto.itemId,
            type: "IN",
            quantity: dto.quantity,
            unitCost,
            batchId: batch.id,
            targetWarehouseId: dto.targetWarehouseId,
            referenceType: dto.referenceType ?? "MANUAL",
            referenceId: dto.referenceId,
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes,
            userId: userId ?? null,
          },
          include: { item: true, targetWarehouse: true },
        });

        await this.core.evaluateAlerts(tx, dto.itemId, dto.targetWarehouseId);
        return movement;
      });
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
      return await this.prisma.$transaction(async (tx) => {
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
          data: {
            itemId: dto.itemId,
            type: "OUT",
            quantity: dto.quantity,
            unitCost: unitCost ?? null,
            batchId: consumed[0]?.batchId ?? null,
            sourceWarehouseId: dto.sourceWarehouseId,
            referenceType: dto.referenceType ?? "MANUAL",
            referenceId: dto.referenceId,
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes,
            userId: userId ?? null,
          },
          include: { item: true, sourceWarehouse: true },
        });

        await this.core.evaluateAlerts(tx, dto.itemId, dto.sourceWarehouseId);
        return movement;
      });
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
        "Source and target warehouses must be different",
      );
    }

    return this.prisma.$transaction(async (tx) => {
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
        data: {
          itemId: dto.itemId,
          type: "TRANSFER",
          quantity: dto.quantity,
          unitCost: carryUnitCost,
          batchId: newBatch.id,
          sourceWarehouseId: dto.sourceWarehouseId,
          targetWarehouseId: dto.targetWarehouseId,
          referenceType: "TRANSFER",
          notes: dto.notes,
          userId: userId ?? null,
        },
        include: { item: true, sourceWarehouse: true, targetWarehouse: true },
      });

      await this.core.evaluateAlerts(tx, dto.itemId, dto.sourceWarehouseId);
      await this.core.evaluateAlerts(tx, dto.itemId, dto.targetWarehouseId);
      return movement;
    });
  }

  async stockAdjustment(dto: StockAdjustmentDto, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
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
        create: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          quantity: dto.newQuantity,
          version: 1,
        },
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
          batchNo: "ADJUSTMENT",
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
        data: {
          itemId: dto.itemId,
          type: "ADJUSTMENT",
          quantity: delta,
          targetWarehouseId: dto.warehouseId,
          referenceType: "ADJUSTMENT",
          notes: dto.notes,
          userId: userId ?? null,
        },
      });

      await this.core.evaluateAlerts(tx, dto.itemId, dto.warehouseId);
      return movement;
    });
  }

  async findAllMovements(filters: StockMovementFilterDto) {
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
        orderBy: { createdAt: "desc" },
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

  // =========================================================================
  //                                PURCHASES
  // =========================================================================

  async createPurchase(dto: CreatePurchaseDto, userId?: string) {
    const totalAmount = dto.items.reduce(
      (sum, i) => sum + (i.price ?? 0) * i.quantity,
      0,
    );
    const paidAmount = Math.max(0, Math.min(dto.paidAmount ?? 0, totalAmount));
    const remainingAmount = totalAmount - paidAmount;
    const paymentStatus =
      remainingAmount === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          referenceNo: dto.referenceNo,
          purchaseDate: dto.purchaseDate
            ? new Date(dto.purchaseDate)
            : new Date(),
          status: dto.status ?? "PENDING",
          notes: dto.notes,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentStatus,
          createdBy: userId,
          items: {
            create: dto.items.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity,
              price: i.price ?? 0,
            })),
          },
        },
        include: { items: { include: { item: true } }, supplier: true },
      });

      // Record initial payment + update supplier balance
      if (paidAmount > 0) {
        await tx.supplierPayment.create({
          data: {
            supplierId: dto.supplierId!,
            purchaseId: purchase.id,
            amount: paidAmount,
            method: "CASH",
            paymentDate: dto.purchaseDate
              ? new Date(dto.purchaseDate)
              : new Date(),
            createdBy: userId,
          },
        });
      }
      if (dto.supplierId && remainingAmount > 0) {
        await tx.supplier.update({
          where: { id: dto.supplierId },
          data: { totalOwed: { increment: remainingAmount } },
        });
      }

      // If marked as RECEIVED and a target warehouse is provided, create IN movements + FIFO batches
      if (dto.status === "RECEIVED" && dto.targetWarehouseId) {
        for (const pi of purchase.items) {
          await this.core.atomicIncrement(
            tx,
            pi.itemId,
            dto.targetWarehouseId,
            pi.quantity,
          );
          const batch = await this.core.addBatch(tx, {
            itemId: pi.itemId,
            warehouseId: dto.targetWarehouseId,
            quantity: pi.quantity,
            unitCost: pi.price,
            purchaseId: purchase.id,
          });
          await tx.stockMovement.create({
            data: {
              itemId: pi.itemId,
              type: "IN",
              quantity: pi.quantity,
              unitCost: pi.price,
              batchId: batch.id,
              targetWarehouseId: dto.targetWarehouseId,
              referenceType: "PURCHASE",
              referenceId: purchase.id,
              purchaseId: purchase.id,
              notes: `Auto IN from purchase #${purchase.id}`,
            },
          });
          await this.core.evaluateAlerts(
            tx,
            pi.itemId,
            dto.targetWarehouseId,
          );
        }
      }

      return purchase;
    });
  }

  async findAllPurchases(filters: PurchaseFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};
    const AND: Prisma.PurchaseWhereInput[] = [];

    if (filters.search) {
      AND.push({
        referenceNo: { contains: filters.search, mode: "insensitive" },
      });
    }
    if (filters.status) AND.push({ status: filters.status });
    if (filters.supplierId) AND.push({ supplierId: filters.supplierId });

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchaseDate: "desc" },
        include: {
          supplier: true,
          items: { include: { item: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOnePurchase(id: number) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { item: true } },
        movements: true,
      },
    });
    if (!purchase) throw new NotFoundException(`Purchase ${id} not found`);
    return purchase;
  }

  async updatePurchase(id: number, dto: UpdatePurchaseDto) {
    await this.findOnePurchase(id);
    // Only allow editing metadata, not line items, for now
    return this.prisma.purchase.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        referenceNo: dto.referenceNo,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
      include: { supplier: true, items: { include: { item: true } } },
    });
  }

  async removePurchase(id: number) {
    await this.findOnePurchase(id);
    return this.prisma.purchase.delete({ where: { id } });
  }

  /**
   * Mark a PENDING purchase as RECEIVED and post the stock IN movements
   * into the specified warehouse. Wrapped in a transaction.
   */
  async receivePurchase(id: number, targetWarehouseId: number) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!purchase) throw new NotFoundException(`Purchase ${id} not found`);
      if (purchase.status === "RECEIVED") {
        throw new BadRequestException("Purchase already received");
      }
      if (purchase.status === "CANCELLED") {
        throw new BadRequestException("Cannot receive a cancelled purchase");
      }
      await this.ensureWarehouse(tx, targetWarehouseId);

      for (const pi of purchase.items) {
        await this.core.atomicIncrement(
          tx,
          pi.itemId,
          targetWarehouseId,
          pi.quantity,
        );
        const batch = await this.core.addBatch(tx, {
          itemId: pi.itemId,
          warehouseId: targetWarehouseId,
          quantity: pi.quantity,
          unitCost: pi.price,
          purchaseId: purchase.id,
        });
        await tx.stockMovement.create({
          data: {
            itemId: pi.itemId,
            type: "IN",
            quantity: pi.quantity,
            unitCost: pi.price,
            batchId: batch.id,
            targetWarehouseId,
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            purchaseId: purchase.id,
            notes: `Received from purchase #${purchase.id}`,
          },
        });
        await this.core.evaluateAlerts(tx, pi.itemId, targetWarehouseId);
      }

      return tx.purchase.update({
        where: { id },
        data: { status: "RECEIVED" },
        include: { items: { include: { item: true } }, supplier: true },
      });
    });
  }

  // =========================================================================
  //                          SUPPLIER PAYMENTS
  // =========================================================================

  async createSupplierPayment(dto: CreateSupplierPaymentDto, userId?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier)
      throw new NotFoundException(`Supplier ${dto.supplierId} not found`);

    // If linked to a specific purchase, validate it + cap
    let purchase: any = null;
    if (dto.purchaseId) {
      purchase = await this.prisma.purchase.findUnique({
        where: { id: dto.purchaseId },
      });
      if (!purchase)
        throw new NotFoundException(`Purchase ${dto.purchaseId} not found`);
      if (dto.amount > purchase.remainingAmount) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds remaining balance (${purchase.remainingAmount})`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: dto.supplierId,
          purchaseId: dto.purchaseId,
          amount: dto.amount,
          method: dto.method ?? "CASH",
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          referenceNo: dto.referenceNo,
          notes: dto.notes,
          createdBy: userId,
        },
      });

      // Update purchase balance if linked
      if (purchase) {
        const newPaid = purchase.paidAmount + dto.amount;
        const newRemaining = purchase.totalAmount - newPaid;
        const newStatus =
          newRemaining === 0 ? "PAID" : newPaid > 0 ? "PARTIAL" : "UNPAID";
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            paymentStatus: newStatus,
          },
        });
      }

      // Decrement supplier total owed
      await tx.supplier.update({
        where: { id: dto.supplierId },
        data: { totalOwed: { decrement: dto.amount } },
      });

      return payment;
    });
  }

  async findAllSupplierPayments(filters: SupplierPaymentFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierPaymentWhereInput = {};
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.purchaseId) where.purchaseId = filters.purchaseId;

    const [data, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: "desc" },
        include: {
          supplier: true,
          purchase: {
            select: { id: true, referenceNo: true, totalAmount: true },
          },
        },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async removeSupplierPayment(id: number) {
    const payment = await this.prisma.supplierPayment.findUnique({
      where: { id },
      include: { purchase: true },
    });
    if (!payment)
      throw new NotFoundException(`Supplier payment ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      // Reverse purchase balance
      if (payment.purchase) {
        const p = payment.purchase;
        const newPaid = Math.max(0, p.paidAmount - payment.amount);
        const newRemaining = p.totalAmount - newPaid;
        const newStatus =
          newRemaining === 0 ? "PAID" : newPaid > 0 ? "PARTIAL" : "UNPAID";
        await tx.purchase.update({
          where: { id: p.id },
          data: {
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            paymentStatus: newStatus,
          },
        });
      }
      // Restore supplier owed
      await tx.supplier.update({
        where: { id: payment.supplierId },
        data: { totalOwed: { increment: payment.amount } },
      });

      return tx.supplierPayment.delete({ where: { id } });
    });
  }

  // =========================================================================
  //                                REPORTS
  // =========================================================================

  async reportSummary() {
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
      this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM items i
          WHERE COALESCE((
            SELECT SUM(quantity)
            FROM inventory_stock
            WHERE "itemId" = i.id
          ), 0) < i."minStock"
        `,
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
  async reportCurrentStock() {
    const items = await this.prisma.item.findMany({
      include: { stocks: true },
      orderBy: { name: "asc" },
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
  async reportLowStock() {
    const all = await this.reportCurrentStock();
    return all.filter((i) => i.totalStock < i.minStock);
  }

  /** Movement counts grouped by type */
  async reportMovementCounts() {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ["type"],
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
  async reportByWarehouse() {
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
  async reportMonthlyUsage() {
    const rows = await this.prisma.$queryRaw<{ month: Date; total: number }[]>`
      SELECT DATE_TRUNC('month', "createdAt") AS month,
             SUM(quantity)::float AS total
      FROM stock_movements
      WHERE type = 'OUT'
        AND "createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `;
    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      total: Number(r.total),
    }));
  }

  /**
   * Items with no OUT movement in the last `days` days. Default 90.
   */
  async reportDeadStock(days = 90) {
    const cutoff = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        totalStock: number;
        lastOutAt: Date | null;
      }[]
    >`
      SELECT i.id, i.name, i.sku,
             COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0)::float AS "totalStock",
             (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') AS "lastOutAt"
      FROM items i
      WHERE COALESCE((SELECT SUM(quantity) FROM inventory_stock WHERE "itemId" = i.id), 0) > 0
        AND (
          (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') IS NULL
          OR (SELECT MAX("createdAt") FROM stock_movements WHERE "itemId" = i.id AND type = 'OUT') < ${cutoff}
        )
      ORDER BY i.name ASC
    `;
    return rows.map((r) => ({
      ...r,
      daysSinceLastOut: r.lastOutAt
        ? Math.floor(
            (Date.now() - new Date(r.lastOutAt).getTime()) / 86400000,
          )
        : null,
    }));
  }

  /**
   * Sales velocity (units sold per day) over a window. Used for reorder
   * recommendations.
   */
  async reportSalesVelocity(days = 30) {
    const start = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        soldQty: number;
        velocityPerDay: number;
      }[]
    >`
      SELECT i.id, i.name, i.sku,
             COALESCE(SUM(sm.quantity), 0)::float AS "soldQty",
             (COALESCE(SUM(sm.quantity), 0) / ${days}::float)::float AS "velocityPerDay"
      FROM items i
      LEFT JOIN stock_movements sm
        ON sm."itemId" = i.id AND sm.type = 'OUT' AND sm."createdAt" >= ${start}
      GROUP BY i.id, i.name, i.sku
      ORDER BY "soldQty" DESC
    `;
    const fast = rows.filter((r) => r.velocityPerDay > 0).slice(0, 10);
    const slow = [...rows]
      .filter((r) => r.velocityPerDay > 0)
      .sort((a, b) => a.velocityPerDay - b.velocityPerDay)
      .slice(0, 10);
    return { windowDays: days, items: rows, fastMoving: fast, slowMoving: slow };
  }

  /**
   * Inventory turnover rate = COGS / average inventory value, over a window.
   */
  async reportTurnover(days = 90) {
    const start = new Date(Date.now() - days * 86400000);
    const cogsRow = await this.prisma.$queryRaw<{ cogs: number | null }[]>`
      SELECT COALESCE(SUM(sm.quantity * COALESCE(sm."unitCost", i."purchasePrice")), 0)::float AS cogs
      FROM stock_movements sm
      JOIN items i ON i.id = sm."itemId"
      WHERE sm.type = 'OUT' AND sm."createdAt" >= ${start}
    `;
    const invValue = await this.prisma.$queryRaw<{ value: number | null }[]>`
      SELECT COALESCE(SUM(s.quantity * i."purchasePrice"), 0)::float AS value
      FROM inventory_stock s
      JOIN items i ON i.id = s."itemId"
    `;
    const cogs = Number(cogsRow[0]?.cogs ?? 0);
    const avgInv = Number(invValue[0]?.value ?? 0);
    const turnover = avgInv > 0 ? cogs / avgInv : 0;
    return {
      windowDays: days,
      cogs,
      avgInventoryValue: avgInv,
      turnoverRate: turnover,
      daysOfInventory: turnover > 0 ? days / turnover : null,
    };
  }

  /**
   * Profit per item over a window. Uses recorded movement.unitCost when
   * available, falling back to item.purchasePrice.
   */
  async reportProfitPerProduct(days = 30) {
    const start = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        sku: string | null;
        unitsSold: number;
        revenue: number;
        cogs: number;
        profit: number;
      }[]
    >`
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
      WHERE s.id IS NOT NULL
      GROUP BY i.id, i.name, i.sku
      ORDER BY profit DESC
    `;
    return { windowDays: days, items: rows };
  }

  /**
   * Reorder recommendations based on velocity, lead time and reorder point.
   */
  async reportReorderSuggestions() {
    const items = await this.prisma.item.findMany({
      include: { stocks: true },
    });
    const velocity = await this.reportSalesVelocity(30);
    const velMap = new Map(velocity.items.map((v) => [v.id, v.velocityPerDay]));

    return items
      .map((i) => {
        const totalStock = i.stocks.reduce((s, x) => s + x.quantity, 0);
        const v = velMap.get(i.id) ?? 0;
        const leadTime = i.leadTimeDays ?? 7;
        const trigger =
          i.reorderPoint ?? Math.max(i.minStock, v * leadTime);
        const needsReorder = totalStock <= trigger && (v > 0 || totalStock < i.minStock);
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

  // =========================================================================
  //                                HELPERS
  // =========================================================================

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
