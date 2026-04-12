import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import {
  StockInDto,
  StockOutDto,
  StockTransferDto,
  StockAdjustmentDto,
} from './dto/stock-movement.dto';
import {
  CreatePurchaseDto,
  UpdatePurchaseDto,
  PurchaseStatus,
} from './dto/purchase.dto';
import {
  ItemFilterDto,
  PaginationDto,
  StockMovementFilterDto,
  PurchaseFilterDto,
} from './dto/inventory-filter.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  //                                 ITEMS
  // =========================================================================

  async createItem(dto: CreateItemDto) {
    try {
      return await this.prisma.item.create({ data: dto });
    } catch (err: any) {
      if (err?.code === 'P2002') {
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
          { name: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
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
        orderBy: { createdAt: 'desc' },
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
          orderBy: { createdAt: 'desc' },
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
            { name: { contains: filters.search, mode: 'insensitive' } },
            { location: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
            { name: { contains: filters.search, mode: 'insensitive' } },
            { contact: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      include: { purchases: { take: 10, orderBy: { purchaseDate: 'desc' } } },
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
    return this.prisma.$transaction(async (tx) => {
      // Verify item and warehouse exist
      await this.ensureItem(tx, dto.itemId);
      await this.ensureWarehouse(tx, dto.targetWarehouseId);

      // Upsert the inventory_stock row and increment the quantity
      await tx.inventoryStock.upsert({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.targetWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          itemId: dto.itemId,
          warehouseId: dto.targetWarehouseId,
          quantity: dto.quantity,
        },
      });

      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: 'IN',
          quantity: dto.quantity,
          targetWarehouseId: dto.targetWarehouseId,
          referenceType: dto.referenceType ?? 'MANUAL',
          referenceId: dto.referenceId,
          notes: dto.notes,
          userId: userId ?? null,
        },
        include: { item: true, targetWarehouse: true },
      });
    });
  }

  async stockOut(dto: StockOutDto, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureItem(tx, dto.itemId);
      await this.ensureWarehouse(tx, dto.sourceWarehouseId);

      // Check current stock
      const stock = await tx.inventoryStock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.sourceWarehouseId,
          },
        },
      });
      if (!stock || stock.quantity < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock: have ${stock?.quantity ?? 0}, need ${dto.quantity}`,
        );
      }

      await tx.inventoryStock.update({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.sourceWarehouseId,
          },
        },
        data: { quantity: { decrement: dto.quantity } },
      });

      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: 'OUT',
          quantity: dto.quantity,
          sourceWarehouseId: dto.sourceWarehouseId,
          referenceType: dto.referenceType ?? 'MANUAL',
          referenceId: dto.referenceId,
          tenderId: dto.tenderId,
          notes: dto.notes,
          userId: userId ?? null,
        },
        include: { item: true, sourceWarehouse: true },
      });
    });
  }

  async stockTransfer(dto: StockTransferDto, userId?: number) {
    if (dto.sourceWarehouseId === dto.targetWarehouseId) {
      throw new BadRequestException(
        'Source and target warehouses must be different',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureItem(tx, dto.itemId);
      await this.ensureWarehouse(tx, dto.sourceWarehouseId);
      await this.ensureWarehouse(tx, dto.targetWarehouseId);

      const source = await tx.inventoryStock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.sourceWarehouseId,
          },
        },
      });
      if (!source || source.quantity < dto.quantity) {
        throw new BadRequestException(
          `Insufficient source stock: have ${source?.quantity ?? 0}, need ${dto.quantity}`,
        );
      }

      // Decrement source
      await tx.inventoryStock.update({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.sourceWarehouseId,
          },
        },
        data: { quantity: { decrement: dto.quantity } },
      });

      // Increment target
      await tx.inventoryStock.upsert({
        where: {
          itemId_warehouseId: {
            itemId: dto.itemId,
            warehouseId: dto.targetWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          itemId: dto.itemId,
          warehouseId: dto.targetWarehouseId,
          quantity: dto.quantity,
        },
      });

      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: 'TRANSFER',
          quantity: dto.quantity,
          sourceWarehouseId: dto.sourceWarehouseId,
          targetWarehouseId: dto.targetWarehouseId,
          referenceType: 'TRANSFER',
          notes: dto.notes,
          userId: userId ?? null,
        },
        include: { item: true, sourceWarehouse: true, targetWarehouse: true },
      });
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
        update: { quantity: dto.newQuantity },
        create: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          quantity: dto.newQuantity,
        },
      });

      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: 'ADJUSTMENT',
          quantity: delta,
          targetWarehouseId: dto.warehouseId,
          referenceType: 'ADJUSTMENT',
          notes: dto.notes,
          userId: userId ?? null,
        },
      });
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

  // =========================================================================
  //                                PURCHASES
  // =========================================================================

  async createPurchase(dto: CreatePurchaseDto, userId?: string) {
    const totalAmount = dto.items.reduce(
      (sum, i) => sum + (i.price ?? 0) * i.quantity,
      0,
    );

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          referenceNo: dto.referenceNo,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          status: dto.status ?? 'PENDING',
          notes: dto.notes,
          totalAmount,
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

      // If marked as RECEIVED and a target warehouse is provided, create IN movements
      if (dto.status === 'RECEIVED' && dto.targetWarehouseId) {
        for (const pi of purchase.items) {
          await tx.inventoryStock.upsert({
            where: {
              itemId_warehouseId: {
                itemId: pi.itemId,
                warehouseId: dto.targetWarehouseId,
              },
            },
            update: { quantity: { increment: pi.quantity } },
            create: {
              itemId: pi.itemId,
              warehouseId: dto.targetWarehouseId,
              quantity: pi.quantity,
            },
          });
          await tx.stockMovement.create({
            data: {
              itemId: pi.itemId,
              type: 'IN',
              quantity: pi.quantity,
              targetWarehouseId: dto.targetWarehouseId,
              referenceType: 'PURCHASE',
              purchaseId: purchase.id,
              notes: `Auto IN from purchase #${purchase.id}`,
            },
          });
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
        referenceNo: { contains: filters.search, mode: 'insensitive' },
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
        orderBy: { purchaseDate: 'desc' },
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
      if (purchase.status === 'RECEIVED') {
        throw new BadRequestException('Purchase already received');
      }
      if (purchase.status === 'CANCELLED') {
        throw new BadRequestException('Cannot receive a cancelled purchase');
      }
      await this.ensureWarehouse(tx, targetWarehouseId);

      for (const pi of purchase.items) {
        await tx.inventoryStock.upsert({
          where: {
            itemId_warehouseId: {
              itemId: pi.itemId,
              warehouseId: targetWarehouseId,
            },
          },
          update: { quantity: { increment: pi.quantity } },
          create: {
            itemId: pi.itemId,
            warehouseId: targetWarehouseId,
            quantity: pi.quantity,
          },
        });
        await tx.stockMovement.create({
          data: {
            itemId: pi.itemId,
            type: 'IN',
            quantity: pi.quantity,
            targetWarehouseId,
            referenceType: 'PURCHASE',
            purchaseId: purchase.id,
            notes: `Received from purchase #${purchase.id}`,
          },
        });
      }

      return tx.purchase.update({
        where: { id },
        data: { status: 'RECEIVED' },
        include: { items: { include: { item: true } }, supplier: true },
      });
    });
  }

  // =========================================================================
  //                                REPORTS
  // =========================================================================

  async reportSummary() {
    const [itemCount, warehouseCount, supplierCount, totalStock, lowStockCount] =
      await Promise.all([
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
  async reportLowStock() {
    const all = await this.reportCurrentStock();
    return all.filter((i) => i.totalStock < i.minStock);
  }

  /** Movement counts grouped by type */
  async reportMovementCounts() {
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
    const rows = await this.prisma.$queryRaw<
      { month: Date; total: number }[]
    >`
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
