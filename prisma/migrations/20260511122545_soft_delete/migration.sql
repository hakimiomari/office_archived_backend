-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inventory_stock" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_count_lines" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_counts" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "alerts_deletedAt_idx" ON "alerts"("deletedAt");

-- CreateIndex
CREATE INDEX "categories_deletedAt_idx" ON "categories"("deletedAt");

-- CreateIndex
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");

-- CreateIndex
CREATE INDEX "departments_deletedAt_idx" ON "departments"("deletedAt");

-- CreateIndex
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");

-- CreateIndex
CREATE INDEX "inventory_batches_deletedAt_idx" ON "inventory_batches"("deletedAt");

-- CreateIndex
CREATE INDEX "inventory_stock_deletedAt_idx" ON "inventory_stock"("deletedAt");

-- CreateIndex
CREATE INDEX "items_deletedAt_idx" ON "items"("deletedAt");

-- CreateIndex
CREATE INDEX "payments_deletedAt_idx" ON "payments"("deletedAt");

-- CreateIndex
CREATE INDEX "purchase_items_deletedAt_idx" ON "purchase_items"("deletedAt");

-- CreateIndex
CREATE INDEX "purchases_deletedAt_idx" ON "purchases"("deletedAt");

-- CreateIndex
CREATE INDEX "sale_items_deletedAt_idx" ON "sale_items"("deletedAt");

-- CreateIndex
CREATE INDEX "sales_deletedAt_idx" ON "sales"("deletedAt");

-- CreateIndex
CREATE INDEX "stock_count_lines_deletedAt_idx" ON "stock_count_lines"("deletedAt");

-- CreateIndex
CREATE INDEX "stock_counts_deletedAt_idx" ON "stock_counts"("deletedAt");

-- CreateIndex
CREATE INDEX "stock_movements_deletedAt_idx" ON "stock_movements"("deletedAt");

-- CreateIndex
CREATE INDEX "supplier_payments_deletedAt_idx" ON "supplier_payments"("deletedAt");

-- CreateIndex
CREATE INDEX "suppliers_deletedAt_idx" ON "suppliers"("deletedAt");

-- CreateIndex
CREATE INDEX "warehouses_deletedAt_idx" ON "warehouses"("deletedAt");
