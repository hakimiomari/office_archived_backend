/*
  Warnings:

  - The values [SMALL,LARGE] on the enum `LicenseType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `fileName` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedBy` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `companyName` on the `licenses` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `licenses` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[companyId,licenseId]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractType` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `contracts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('SMALL_SCALE', 'LARGE_SCALE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LicenseStatus" ADD VALUE 'PENDING';
ALTER TYPE "LicenseStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "LicenseType_new" AS ENUM ('TRADE', 'IMPORT', 'EXPORT', 'INDUSTRIAL', 'PROFESSIONAL');
ALTER TABLE "licenses" ALTER COLUMN "licenseType" TYPE "LicenseType_new" USING ("licenseType"::text::"LicenseType_new");
ALTER TYPE "LicenseType" RENAME TO "LicenseType_old";
ALTER TYPE "LicenseType_new" RENAME TO "LicenseType";
DROP TYPE "LicenseType_old";
COMMIT;

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "fileName",
DROP COLUMN "fileType",
DROP COLUMN "fileUrl",
DROP COLUMN "uploadedAt",
DROP COLUMN "uploadedBy",
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "contractType" "ContractType" NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" "ContractStatus" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "licenses" DROP COLUMN "companyName",
DROP COLUMN "licenseNumber",
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "deleted_by" INTEGER;

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "TIN" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shareAmount" DECIMAL(10,2) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provinces" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_companyId_licenseId_key" ON "contracts"("companyId", "licenseId");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
