import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryCoreService } from '../../inventory/inventory-core.service';
import { tenantCreate } from '../../tenant/tenant-create';
import { effectiveCompanyId } from '../../tenant/tenant-context';
import { EventBus } from '../../events/event-bus.service';
import { EVENTS } from '../../events/event-types';
import {
  CreateSaleDto,
  UpdateSaleDto,
  SaleFilterDto,
  PaymentStatus,
} from '../dto/sale.dto';

/**
 * Sales / invoices: CRUD + lifecycle. The interesting bits are the
 * transactional create + cancel:
 *
 *  - `create` validates totals + warehouse, generates a fresh invoice
 *    number, posts an OUT stock movement per line item, runs FIFO cost
 *    consumption (so margin reports have accurate COGS), records the
 *    initial payment if any, and bumps customer.totalOwed. All inside one
 *    `$transaction` so a failure rolls everything back. Idempotency keys
 *    on the FIRST stock movement let clients safely retry.
 *  - `cancel` reverses the OUT movements with matching IN movements and
 *    fresh FIFO batches at the originally-recorded unit cost, then revives
 *    `customer.totalOwed`.
 *
 * Hard-delete is a separate path that simply restores customer.totalOwed
 * if the sale was still receivable; stock is NOT reverted on hard delete
 * (use cancel for that).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
    private readonly events: EventBus,
  ) {}

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

  async create(dto: CreateSaleDto, userId?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    // Idempotency: a previously-processed key returns the original sale.
    if (dto.idempotencyKey) {
      const prior = await this.prisma.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (prior?.referenceType === 'SALE' && prior.referenceId) {
        return this.findOne(prior.referenceId);
      }
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

    const invoiceNo = await this.generateInvoiceNo();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: tenantCreate<Prisma.SaleUncheckedCreateInput>({
          invoiceNo,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          subtotal,
          discount,
          tax,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentStatus,
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
        }),
        include: {
          customer: true,
          items: { include: { item: true } },
        },
      });

      // Atomic decrement + FIFO consumption per line item.
      for (const [idx, li] of dto.items.entries()) {
        await this.core.atomicDecrement(
          tx,
          li.itemId,
          dto.warehouseId,
          li.quantity,
        );
        const consumed = await this.core.consumeFIFO(
          tx,
          li.itemId,
          dto.warehouseId,
          li.quantity,
        );
        const totalCost = consumed.reduce(
          (s, c) => s + c.quantity * c.unitCost,
          0,
        );
        const unitCost =
          consumed.length > 0 ? totalCost / li.quantity : null;

        // Idempotency key only on the first movement (unique constraint).
        const idempKey =
          dto.idempotencyKey && idx === 0 ? dto.idempotencyKey : null;

        await tx.stockMovement.create({
          data: tenantCreate<Prisma.StockMovementUncheckedCreateInput>({
            itemId: li.itemId,
            type: 'OUT',
            quantity: li.quantity,
            unitCost,
            batchId: consumed[0]?.batchId ?? null,
            sourceWarehouseId: dto.warehouseId,
            referenceType: 'SALE',
            referenceId: sale.id,
            idempotencyKey: idempKey,
            notes: `Sale ${invoiceNo}`,
          }),
        });

        await this.core.evaluateAlerts(tx, li.itemId, dto.warehouseId);
      }

      // Record initial payment if any
      if (paidAmount > 0) {
        await tx.payment.create({
          data: tenantCreate<Prisma.PaymentUncheckedCreateInput>({
            saleId: sale.id,
            amount: paidAmount,
            paymentDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
            createdBy: userId,
          }),
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
    }).then((sale) => {
      // Emit AFTER the transaction commits so listeners can't observe
      // a half-committed write.
      const companyId = effectiveCompanyId();
      if (companyId != null) {
        this.events.emit(EVENTS.SALE_CREATED, {
          companyId,
          saleId: sale.id,
          invoiceNo: sale.invoiceNo,
          customerId: sale.customerId,
          totalAmount,
          paidAmount,
          remainingAmount,
        });
      }
      return sale;
    });
  }

  async findAll(filters: SaleFilterDto) {
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

  async findOne(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { item: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!sale) throw new NotFoundException(`Sale ${id} not found`);
    return sale;
  }

  async update(id: number, dto: UpdateSaleDto) {
    await this.findOne(id);
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
  async cancel(id: number, userId?: string) {
    const sale = await this.findOne(id);
    if (sale.saleStatus === 'CANCELLED') {
      throw new BadRequestException('Sale is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Restore stock + a fresh FIFO batch carrying the recorded unitCost
      for (const item of sale.items) {
        await this.core.atomicIncrement(
          tx,
          item.itemId,
          sale.warehouseId,
          item.quantity,
        );

        // Use the cost recorded on the original SALE OUT movement (if any)
        const origOut = await tx.stockMovement.findFirst({
          where: {
            referenceType: 'SALE',
            referenceId: sale.id,
            itemId: item.itemId,
            type: 'OUT',
          },
          orderBy: { id: 'asc' },
        });
        const carryCost = origOut?.unitCost ?? null;
        const batch = await this.core.addBatch(tx, {
          itemId: item.itemId,
          warehouseId: sale.warehouseId,
          quantity: item.quantity,
          unitCost: carryCost ?? 0,
          batchNo: `CANCELLED-SALE-${sale.invoiceNo}`,
        });

        await tx.stockMovement.create({
          data: tenantCreate<Prisma.StockMovementUncheckedCreateInput>({
            itemId: item.itemId,
            type: 'IN',
            quantity: item.quantity,
            unitCost: carryCost,
            batchId: batch.id,
            targetWarehouseId: sale.warehouseId,
            referenceType: 'SALE',
            referenceId: sale.id,
            notes: `Cancelled sale ${sale.invoiceNo}`,
            userId: userId ? Number(userId) || null : null,
          }),
        });

        await this.core.evaluateAlerts(tx, item.itemId, sale.warehouseId);
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
    }).then((updated) => {
      const companyId = effectiveCompanyId();
      if (companyId != null) {
        this.events.emit(EVENTS.SALE_CANCELLED, {
          companyId,
          saleId: sale.id,
          invoiceNo: sale.invoiceNo,
          customerId: sale.customerId,
          remainingAmount: sale.remainingAmount,
        });
      }
      return updated;
    });
  }

  async remove(id: number) {
    const sale = await this.findOne(id);
    // Restore customer owed if applicable
    if (
      sale.customerId &&
      sale.remainingAmount > 0 &&
      sale.saleStatus === 'COMPLETED'
    ) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { totalOwed: { decrement: sale.remainingAmount } },
      });
    }
    return this.prisma.sale.delete({ where: { id } });
  }
}
