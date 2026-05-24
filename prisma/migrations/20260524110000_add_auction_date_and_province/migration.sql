-- AlterTable: add `auctionDate` (required) safely by giving a temporary
-- default of now() to backfill any existing rows, then dropping the default
-- so new rows must supply it. Add nullable `provinceId` + FK to provinces.
ALTER TABLE "auctions" ADD COLUMN "auctionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "auctions" ALTER COLUMN "auctionDate" DROP DEFAULT;
ALTER TABLE "auctions" ADD COLUMN "provinceId" INTEGER;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
