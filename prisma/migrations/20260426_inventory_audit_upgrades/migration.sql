-- =============================================================
-- Inventory audit upgrades:
--  * Category hierarchy (Category model)
--  * Per-item maxStock / reorderPoint / reorderQuantity / leadTimeDays
--  * InventoryStock.version for optimistic locking
--  * InventoryBatch (FIFO / batch tracking)
--  * StockMovement.idempotencyKey, unitCost, batchId
--  * Alert + AlertType / AlertStatus
--  * StockCount + StockCountLine + StockCountStatus
-- =============================================================

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OVERSTOCK', 'DEAD_STOCK', 'REORDER');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable: categories
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE UNIQUE INDEX "categories_parentId_name_key" ON "categories"("parentId", "name");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: items
ALTER TABLE "items" ADD COLUMN "categoryId" INTEGER;
ALTER TABLE "items" ADD COLUMN "maxStock" DOUBLE PRECISION;
ALTER TABLE "items" ADD COLUMN "reorderPoint" DOUBLE PRECISION;
ALTER TABLE "items" ADD COLUMN "reorderQuantity" DOUBLE PRECISION;
ALTER TABLE "items" ADD COLUMN "leadTimeDays" INTEGER;
CREATE INDEX "items_categoryId_idx" ON "items"("categoryId");
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: inventory_stock — version column for optimistic locking
ALTER TABLE "inventory_stock" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: inventory_batches (FIFO)
CREATE TABLE "inventory_batches" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchNo" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "purchaseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_batches_itemId_warehouseId_idx" ON "inventory_batches"("itemId", "warehouseId");
CREATE INDEX "inventory_batches_receivedAt_idx" ON "inventory_batches"("receivedAt");
CREATE INDEX "inventory_batches_expiryDate_idx" ON "inventory_batches"("expiryDate");
CREATE INDEX "inventory_batches_purchaseId_idx" ON "inventory_batches"("purchaseId");
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "unitCost" DOUBLE PRECISION;
ALTER TABLE "stock_movements" ADD COLUMN "batchId" INTEGER;
ALTER TABLE "stock_movements" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "stock_movements_idempotencyKey_key" ON "stock_movements"("idempotencyKey");
CREATE INDEX "stock_movements_referenceType_referenceId_idx" ON "stock_movements"("referenceType", "referenceId");

-- CreateTable: alerts
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "message" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "alerts_type_idx" ON "alerts"("type");
CREATE INDEX "alerts_status_idx" ON "alerts"("status");
CREATE INDEX "alerts_itemId_idx" ON "alerts"("itemId");
CREATE INDEX "alerts_warehouseId_idx" ON "alerts"("warehouseId");
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: stock_counts
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "reference" TEXT,
    "warehouseId" INTEGER NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_counts_reference_key" ON "stock_counts"("reference");
CREATE INDEX "stock_counts_warehouseId_idx" ON "stock_counts"("warehouseId");
CREATE INDEX "stock_counts_status_idx" ON "stock_counts"("status");
CREATE INDEX "stock_counts_startedAt_idx" ON "stock_counts"("startedAt");
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: stock_count_lines
CREATE TABLE "stock_count_lines" (
    "id" SERIAL NOT NULL,
    "stockCountId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "expectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_count_lines_stockCountId_itemId_key" ON "stock_count_lines"("stockCountId", "itemId");
CREATE INDEX "stock_count_lines_stockCountId_idx" ON "stock_count_lines"("stockCountId");
CREATE INDEX "stock_count_lines_itemId_idx" ON "stock_count_lines"("itemId");
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stockCountId_fkey"
  FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
