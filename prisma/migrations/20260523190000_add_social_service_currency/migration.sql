-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AFN', 'USD');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "social_service_currency" "Currency" DEFAULT 'AFN';
