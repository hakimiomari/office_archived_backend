import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule],
  controllers: [SalesController],
  providers: [SalesService, InvoicePdfService],
  exports: [SalesService],
})
export class SalesModule {}
