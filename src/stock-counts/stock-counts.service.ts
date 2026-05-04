import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCoreService } from '../inventory/inventory-core.service';
import {
  CompleteCountDto,
  CreateStockCountDto,
  StockCountFilterDto,
  SubmitCountDto,
} from './stock-counts.dto';

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
  ) {}

  async create(dto: CreateStockCountDto, createdBy?: string) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!wh) throw new NotFoundException(`Warehouse ${dto.warehouseId} not found`);

    const itemIds =
      dto.itemIds && dto.itemIds.length > 0
        ? dto.itemIds
        : (
            await this.prisma.inventoryStock.findMany({
              where: { warehouseId: dto.warehouseId },
              select: { itemId: true },
            })
          ).map((s) => s.itemId);

    const stocks = await this.prisma.inventoryStock.findMany({
      where: { warehouseId: dto.warehouseId, itemId: { in: itemIds } },
    });
    const expectedMap = new Map(stocks.map((s) => [s.itemId, s.quantity]));

    return this.prisma.stockCount.create({
      data: {
        warehouseId: dto.warehouseId,
        reference: dto.reference ?? `CC-${Date.now()}`,
        notes: dto.notes,
        status: 'IN_PROGRESS',
        createdBy,
        lines: {
          create: itemIds.map((itemId) => ({
            itemId,
            expectedQty: expectedMap.get(itemId) ?? 0,
            countedQty: 0,
            variance: 0,
          })),
        },
      } as any,
      include: { lines: true, warehouse: true },
    });
  }

  async findAll(filters: StockCountFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockCountWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;

    const [data, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          warehouse: true,
          _count: { select: { lines: true } },
        },
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const sc = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        warehouse: true,
        lines: { include: { item: true } },
      },
    });
    if (!sc) throw new NotFoundException(`Stock count ${id} not found`);
    return sc;
  }

  /**
   * Record counted quantities. Lines not present in the payload remain
   * untouched. Variance = countedQty - expectedQty.
   */
  async submit(id: number, dto: SubmitCountDto) {
    const sc = await this.findOne(id);
    if (sc.status === 'COMPLETED' || sc.status === 'CANCELLED') {
      throw new BadRequestException(
        `Stock count is ${sc.status} and cannot be modified`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of dto.lines) {
        const existing = sc.lines.find((l) => l.itemId === line.itemId);
        if (!existing) {
          // Auto-add an unexpected line; expected is current stock.
          const stock = await tx.inventoryStock.findUnique({
            where: {
              itemId_warehouseId: {
                itemId: line.itemId,
                warehouseId: sc.warehouseId,
              },
            },
          });
          await tx.stockCountLine.create({
            data: {
              stockCountId: id,
              itemId: line.itemId,
              expectedQty: stock?.quantity ?? 0,
              countedQty: line.countedQty,
              variance: line.countedQty - (stock?.quantity ?? 0),
              notes: line.notes,
            } as any,
          });
        } else {
          await tx.stockCountLine.update({
            where: { id: existing.id },
            data: {
              countedQty: line.countedQty,
              variance: line.countedQty - existing.expectedQty,
              notes: line.notes,
            },
          });
        }
      }
      return tx.stockCount.findUnique({
        where: { id },
        include: { lines: { include: { item: true } } },
      });
    });
  }

  /**
   * Mark a count COMPLETED. If `applyAdjustments` is true (default), each
   * non-zero variance creates an ADJUSTMENT stock movement that reconciles
   * inventory_stock to the counted value.
   */
  async complete(id: number, dto: CompleteCountDto, userId?: number) {
    const sc = await this.findOne(id);
    if (sc.status === 'COMPLETED' || sc.status === 'CANCELLED') {
      throw new BadRequestException(
        `Stock count is already ${sc.status}`,
      );
    }
    const apply = dto.applyAdjustments ?? true;

    return this.prisma.$transaction(async (tx) => {
      if (apply) {
        for (const line of sc.lines) {
          const variance = line.countedQty - line.expectedQty;
          if (variance === 0) continue;
          await tx.inventoryStock.upsert({
            where: {
              itemId_warehouseId: {
                itemId: line.itemId,
                warehouseId: sc.warehouseId,
              },
            },
            update: {
              quantity: line.countedQty,
              version: { increment: 1 },
            },
            create: {
              itemId: line.itemId,
              warehouseId: sc.warehouseId,
              quantity: line.countedQty,
              version: 1,
            } as any,
          });
          if (variance > 0) {
            const item = await tx.item.findUnique({
              where: { id: line.itemId },
            });
            await this.core.addBatch(tx, {
              itemId: line.itemId,
              warehouseId: sc.warehouseId,
              quantity: variance,
              unitCost: item?.purchasePrice ?? 0,
              batchNo: `STOCK-COUNT-${sc.id}`,
            });
          } else {
            await this.core.consumeFIFO(
              tx,
              line.itemId,
              sc.warehouseId,
              Math.abs(variance),
            );
          }
          await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              type: 'ADJUSTMENT',
              quantity: variance,
              targetWarehouseId: sc.warehouseId,
              referenceType: 'ADJUSTMENT',
              referenceId: sc.id,
              userId: userId ?? null,
              notes: `Stock count ${sc.reference ?? sc.id}`,
            } as any,
          });
          await this.core.evaluateAlerts(tx, line.itemId, sc.warehouseId);
        }
      }

      return tx.stockCount.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: { lines: { include: { item: true } } },
      });
    });
  }

  async cancel(id: number) {
    const sc = await this.findOne(id);
    if (sc.status === 'COMPLETED' || sc.status === 'CANCELLED') {
      throw new BadRequestException(`Already ${sc.status}`);
    }
    return this.prisma.stockCount.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.stockCount.delete({ where: { id } });
  }

  /** Variance summary across recent counts — recurring discrepancy detection. */
  async varianceSummary(days = 90) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      {
        itemId: number;
        name: string;
        countCount: bigint;
        totalVariance: number;
        absVariance: number;
      }[]
    >`
      SELECT scl."itemId" AS "itemId",
             i.name,
             COUNT(*)::bigint AS "countCount",
             SUM(scl.variance)::float AS "totalVariance",
             SUM(ABS(scl.variance))::float AS "absVariance"
      FROM stock_count_lines scl
      JOIN stock_counts sc ON sc.id = scl."stockCountId"
      JOIN items i ON i.id = scl."itemId"
      WHERE sc."completedAt" IS NOT NULL
        AND sc."completedAt" >= ${since}
        AND scl.variance <> 0
      GROUP BY scl."itemId", i.name
      ORDER BY "absVariance" DESC
    `;
    return rows.map((r) => ({
      itemId: r.itemId,
      name: r.name,
      countCount: Number(r.countCount),
      totalVariance: r.totalVariance,
      absVariance: r.absVariance,
    }));
  }
}
