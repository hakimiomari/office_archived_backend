import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { CustomersService } from './customers/customers.service';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentsService } from './payments/payments.service';
import { SalesReportsService } from './reports/sales-reports.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';

/**
 * Sales module — split into four sub-services:
 *  - CustomersService     (CRUD + per-customer summary stats)
 *  - InvoicesService      (sale lifecycle + transactional create/cancel)
 *  - PaymentsService      (payment record + customer balance bookkeeping)
 *  - SalesReportsService  (dashboard KPIs + period reports + customer
 *                          statement data + overdue list)
 *
 * The controller stays as one file (`sales.controller.ts`) so route paths
 * are guaranteed stable.
 */
@Module({
  imports: [PrismaModule, AuthModule, InventoryModule],
  controllers: [SalesController],
  providers: [
    CustomersService,
    InvoicesService,
    PaymentsService,
    SalesReportsService,
    InvoicePdfService,
  ],
  exports: [
    CustomersService,
    InvoicesService,
    PaymentsService,
    SalesReportsService,
  ],
})
export class SalesModule {}
