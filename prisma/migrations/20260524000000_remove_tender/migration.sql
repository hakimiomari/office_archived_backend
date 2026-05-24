-- CreateEnum
CREATE TYPE "MassUnit" AS ENUM ('Gram', 'Kilogram', 'Carat');

-- DropForeignKey
ALTER TABLE "tender_activity" DROP CONSTRAINT "tender_activity_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "tender_tags" DROP CONSTRAINT "tender_tags_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "tenders" DROP CONSTRAINT "tenders_organizationId_fkey";

-- DropTable
DROP TABLE "organizations";

-- DropTable
DROP TABLE "tender_activity";

-- DropTable
DROP TABLE "tender_tags";

-- DropTable
DROP TABLE "tenders";

-- DropEnum
DROP TYPE "TenderActivityAction";

-- DropEnum
DROP TYPE "TenderLanguage";

-- DropEnum
DROP TYPE "TenderSector";

-- DropEnum
DROP TYPE "TenderStatus";

-- DropEnum
DROP TYPE "TenderType";

