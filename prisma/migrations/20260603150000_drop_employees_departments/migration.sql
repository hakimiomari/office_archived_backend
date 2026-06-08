-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_departmentId_fkey";

-- DropTable
DROP TABLE "departments";

-- DropTable
DROP TABLE "employees";

-- DropEnum
DROP TYPE "EmployeeStatus";
