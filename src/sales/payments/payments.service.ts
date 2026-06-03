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
import { InvoicesService } from '../invoices/invoices.service';
import { CreatePaymentDto, PaymentFilterDto } from '../dto/payment.dto';
import { PaymentStatus } from '../dto/sale.dto';

/**
 * Payments are recorded against a Sale and update its `paidAmount` /
 * `remainingAmount` / `paymentStatus` plus the customer's `totalOwed`.
 *
 * Both `create` and `remove` run inside a transaction so the sale and
 * customer aggregates can never drift from the sum of payments.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly events: EventBus,
  ) {}

  async create(dto: CreatePaymentDto, userId?: string) {
    const sale = await this.invoices.findOne(dto.saleId);
    if (sale.saleStatus === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot record payment on a cancelled sale',
      );
    }

    if (dto.amount > sale.remainingAmount) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds remaining balance (${sale.remainingAmount})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: tenantCreateStrict<Prisma.PaymentUncheckedCreateInput>({
          saleId: dto.saleId,
          amount: dto.amount,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          referenceNo: dto.referenceNo,
          notes: dto.notes,
          createdBy: userId,
        }),
      });

      const newPaid = sale.paidAmount + dto.amount;
      const newRemaining = sale.totalAmount - newPaid;
      const newStatus: PaymentStatus =
        newRemaining === 0
          ? PaymentStatus.PAID
          : newPaid > 0
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID;

      await tx.sale.update({
        where: { id: dto.saleId },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
        },
      });

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalOwed: { decrement: dto.amount } },
        });
      }

      return payment;
    }).then((payment) => {
      const companyId = effectiveCompanyId();
      if (companyId != null) {
        this.events.emit(EVENTS.PAYMENT_RECEIVED, {
          companyId,
          paymentId: payment.id,
          saleId: dto.saleId,
          customerId: sale.customerId,
          amount: dto.amount,
        });
      }
      return payment;
    });
  }

  async findAll(filters: PaymentFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};
    if (filters.saleId) where.saleId = filters.saleId;
    if (filters.from || filters.to) {
      where.paymentDate = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          sale: { include: { customer: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async remove(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      const sale = payment.sale;
      const newPaid = Math.max(0, sale.paidAmount - payment.amount);
      const newRemaining = sale.totalAmount - newPaid;
      const newStatus: PaymentStatus =
        newRemaining === 0
          ? PaymentStatus.PAID
          : newPaid > 0
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
        },
      });

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalOwed: { increment: payment.amount } },
        });
      }

      return tx.payment.delete({ where: { id } });
    });
  }
}
