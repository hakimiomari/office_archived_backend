-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_parentId_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_categoryId_fkey";

-- DropIndex
DROP INDEX "items_categoryId_idx";

-- DropIndex
DROP INDEX "items_category_idx";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "category",
DROP COLUMN "categoryId";

-- DropTable
DROP TABLE "categories";

-- DropEnum
DROP TYPE "ItemCategory";

