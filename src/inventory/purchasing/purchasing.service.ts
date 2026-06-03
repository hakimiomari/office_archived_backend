import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryCoreService } from '../inventory-core.service';
import { tenantCreate, tenantCreateStrict } from '../../tenant/tenant-create';
import { effectiveCompanyId } from '../../tenant/tenant-context';
import { EventBus } from '../../events/event-bus.service';
import { EVENTS } from '../../events/event-types';
import {
  CreatePurchaseDto,
  CreateSupplierPaymentDto,
  SupplierPaymentFilterDto,
  UpdatePurchaseDto,
} from '../dto/purchase.dto';
import { PurchaseFilterDto } from '../dto/inventory-filter.dto';

/**
 * Purchases (purchase orders) + supplier payments. Three transactional
 * flows live here:
 *
 *  - `create` — opens a Purchase with line items, optionally records the
 *    first supplier payment, and if status=RECEIVED also posts the IN
 *    movements + FIFO batches into the target warehouse.
 *  - `receive` — flips a PENDING purchase to RECEIVED and posts IN
 *    movements / FIFO batches (used when receiving is decoupled from
 *    purchase entry).
 *  - `createSupplierPayment` — books a payment against either a specific
 *    purchase or the supplier overall, decrements `supplier.totalOwed`,
 *    and rolls the purchase's `paymentStatus` forward.
 *
 * `removeSupplierPayment` runs the reverse bookkeeping.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InventoryCoreService,
    private readonly events: EventBus,
  ) {}

  // ----------------------- PURCHASES ------------------------

  async create(dto: CreatePurchaseDto, userId?: string) {
    const totalAmount = dto.items.reduce(
      (sum, i) => sum + (i.price ?? 0) * i.quantity,
      0,
    );
    const paidAmount = Math.max(0, Math.min(dto.paidAmount ?? 0, totalAmount));
    const remainingAmount = totalAmount - paidAmount;
    const paymentStatus =
      remainingAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: tenantCreate<Prisma.PurchaseUncheckedCreateInput>({
          supplierId: dto.supplierId,
          referenceNo: dto.referenceNo,
          purchaseDate: dto.purchaseDate
            ? new Date(dto.purchaseDate)
            : new Date(),
          status: dto.status ?? 'PENDING',
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
        }),
        include: { items: { include: { item: true } }, supplier: true },
      });

      // Record initial payment + update supplier balance
      if (paidAmount > 0) {
        await tx.supplierPayment.create({
          data: tenantCreateStrict<Prisma.SupplierPaymentUncheckedCreateInput>({
            supplierId: dto.supplierId!,
            purchaseId: purchase.id,
            amount: paidAmount,
            paymentDate: dto.purchaseDate
              ? new Date(dto.purchaseDate)
              : new Date(),
            createdBy: userId,
          }),
        });
      }
      if (dto.supplierId && remainingAmount > 0) {
        await tx.supplier.update({
          where: { id: dto.supplierId },
          data: { totalOwed: { increment: remainingAmount } },
        });
      }

      // If marked as RECEIVED and a target warehouse is provided, create IN movements + FIFO batches
      if (dto.status === 'RECEIVED' && dto.targetWarehouseId) {
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
            data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
              itemId: pi.itemId,
              type: 'IN',
              quantity: pi.quantity,
              unitCost: pi.price,
              batchId: batch.id,
              targetWarehouseId: dto.targetWarehouseId,
              referenceType: 'PURCHASE',
              referenceId: purchase.id,
              purchaseId: purchase.id,
              notes: `Auto IN from purchase #${purchase.id}`,
            }),
          });
          await this.core.evaluateAlerts(
            tx,
            pi.itemId,
            dto.targetWarehouseId,
          );
        }
      }

      return purchase;
    }).then((purchase) => {
      // Only emit purchase.received when the create immediately receives.
      // The separate `receive()` flow has its own emit below.
      if (dto.status === 'RECEIVED' && dto.targetWarehouseId) {
        const companyId = effectiveCompanyId();
        if (companyId != null) {
          this.events.emit(EVENTS.PURCHASE_RECEIVED, {
            companyId,
            purchaseId: purchase.id,
            supplierId: dto.supplierId ?? null,
            totalAmount,
            paidAmount,
            remainingAmount,
            targetWarehouseId: dto.targetWarehouseId,
          });
        }
      }
      return purchase;
    });
  }

  async findAll(filters: PurchaseFilterDto) {
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

  async findOne(id: number) {
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

  async update(id: number, dto: UpdatePurchaseDto) {
    await this.findOne(id);
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

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.purchase.delete({ where: { id } });
  }

  /**
   * Mark a PENDING purchase as RECEIVED and post the stock IN movements
   * into the specified warehouse. Wrapped in a transaction.
   */
  async receive(id: number, targetWarehouseId: number) {
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
      const wh = await tx.warehouse.findUnique({
        where: { id: targetWarehouseId },
      });
      if (!wh)
        throw new NotFoundException(`Warehouse ${targetWarehouseId} not found`);

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
          data: tenantCreateStrict<Prisma.StockMovementUncheckedCreateInput>({
            itemId: pi.itemId,
            type: 'IN',
            quantity: pi.quantity,
            unitCost: pi.price,
            batchId: batch.id,
            targetWarehouseId,
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            purchaseId: purchase.id,
            notes: `Received from purchase #${purchase.id}`,
          }),
        });
        await this.core.evaluateAlerts(tx, pi.itemId, targetWarehouseId);
      }

      return tx.purchase.update({
        where: { id },
        data: { status: 'RECEIVED' },
        include: { items: { include: { item: true } }, supplier: true },
      });
    }).then((received) => {
      const companyId = effectiveCompanyId();
      if (companyId != null) {
        this.events.emit(EVENTS.PURCHASE_RECEIVED, {
          companyId,
          purchaseId: received.id,
          supplierId: received.supplierId ?? null,
          totalAmount: received.totalAmount,
          paidAmount: received.paidAmount,
          remainingAmount: received.remainingAmount,
          targetWarehouseId,
        });
      }
      return received;
    });
  }

  // ----------------------- SUPPLIER PAYMENTS ------------------------

  async createSupplierPayment(
    dto: CreateSupplierPaymentDto,
    userId?: string,
  ) {
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
        data: tenantCreateStrict<Prisma.SupplierPaymentUncheckedCreateInput>({
          supplierId: dto.supplierId,
          purchaseId: dto.purchaseId,
          amount: dto.amount,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          referenceNo: dto.referenceNo,
          notes: dto.notes,
          createdBy: userId,
        }),
      });

      // Update purchase balance if linked
      if (purchase) {
        const newPaid = purchase.paidAmount + dto.amount;
        const newRemaining = purchase.totalAmount - newPaid;
        const newStatus =
          newRemaining === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
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
    }).then((payment) => {
      const companyId = effectiveCompanyId();
      if (companyId != null) {
        this.events.emit(EVENTS.SUPPLIER_PAYMENT_RECEIVED, {
          companyId,
          paymentId: payment.id,
          supplierId: dto.supplierId,
          purchaseId: dto.purchaseId ?? null,
          amount: dto.amount,
        });
      }
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
        orderBy: { paymentDate: 'desc' },
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
          newRemaining === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
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
}
