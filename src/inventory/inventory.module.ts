import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryCoreService } from './inventory-core.service';
import { ItemsService } from './items/items.service';
import { WarehousesService } from './warehouses/warehouses.service';
import { SuppliersService } from './suppliers/suppliers.service';
import { MovementsService } from './movements/movements.service';
import { PurchasingService } from './purchasing/purchasing.service';
import { InventoryReportsService } from './reports/inventory-reports.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Inventory module — split into six sub-services:
 *  - ItemsService              (SKU master data)
 *  - WarehousesService         (storage locations + per-warehouse stats)
 *  - SuppliersService          (supplier master data)
 *  - MovementsService          (IN / OUT / TRANSFER / ADJUSTMENT primitives,
 *                               all wrapped in `$transaction` with FIFO + alerts)
 *  - PurchasingService         (purchases + receive flow + supplier payments)
 *  - InventoryReportsService   (all read-only analytics)
 *  - InventoryCoreService      (shared atomic primitives — atomicDecrement,
 *                               consumeFIFO, addBatch, evaluateAlerts)
 *
 * The controller stays as one file (`inventory.controller.ts`) so the
 * many sibling routes under `/inventory/*` retain their existing
 * registration order and route paths.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [InventoryController],
  providers: [
    InventoryCoreService,
    ItemsService,
    WarehousesService,
    SuppliersService,
    MovementsService,
    PurchasingService,
    InventoryReportsService,
  ],
  exports: [
    InventoryCoreService,
    ItemsService,
    WarehousesService,
    SuppliersService,
    MovementsService,
    PurchasingService,
    InventoryReportsService,
  ],
})
export class InventoryModule {}
