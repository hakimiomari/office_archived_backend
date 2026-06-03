-- AlterTable
ALTER TABLE "payments" DROP COLUMN "method";

-- AlterTable
ALTER TABLE "supplier_payments" DROP COLUMN "method";

-- DropEnum
DROP TYPE "PaymentMethod";
