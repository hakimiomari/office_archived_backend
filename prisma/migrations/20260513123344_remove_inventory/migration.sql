/*
  Warnings:

  - You are about to drop the `inventory_stock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchases` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `stock_movements` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suppliers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `warehouses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "inventory_stock" DROP CONSTRAINT "inventory_stock_itemId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_stock" DROP CONSTRAINT "inventory_stock_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_sourceWarehouseId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_targetWarehouseId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_tenderId_fkey";

-- DropTable
DROP TABLE "inventory_stock";

-- DropTable
DROP TABLE "items";

-- DropTable
DROP TABLE "purchase_items";

-- DropTable
DROP TABLE "purchases";

-- DropTable
DROP TABLE "stock_movements";

-- DropTable
DROP TABLE "suppliers";

-- DropTable
DROP TABLE "warehouses";

-- DropEnum
DROP TYPE "ItemCategory";

-- DropEnum
DROP TYPE "PurchaseStatus";

-- DropEnum
DROP TYPE "StockMovementReference";

-- DropEnum
DROP TYPE "StockMovementType";
