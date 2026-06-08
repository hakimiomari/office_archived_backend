-- AlterEnum
ALTER TYPE "MassUnit" ADD VALUE 'Ton';

-- DropForeignKey
ALTER TABLE "equipment_assignments" DROP CONSTRAINT "equipment_assignments_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_maintenance" DROP CONSTRAINT "equipment_maintenance_equipmentId_fkey";

-- DropTable
DROP TABLE "equipment";

-- DropTable
DROP TABLE "equipment_assignments";

-- DropTable
DROP TABLE "equipment_maintenance";

-- DropEnum
DROP TYPE "EquipmentAssignmentStatus";

-- DropEnum
DROP TYPE "EquipmentCategory";

-- DropEnum
DROP TYPE "EquipmentCondition";

-- DropEnum
DROP TYPE "EquipmentMaintenanceStatus";

-- DropEnum
DROP TYPE "EquipmentStatus";
