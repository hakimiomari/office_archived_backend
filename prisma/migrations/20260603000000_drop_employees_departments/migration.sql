-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_employeeId_fkey";

-- DropIndex
DROP INDEX "payments_employeeId_idx";

-- DropIndex
DROP INDEX "sales_employeeId_idx";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "employeeId";

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "employeeId";

-- DropTable
DROP TABLE "departments";

-- DropTable
DROP TABLE "employees";

-- DropEnum
DROP TYPE "EmployeeStatus";
