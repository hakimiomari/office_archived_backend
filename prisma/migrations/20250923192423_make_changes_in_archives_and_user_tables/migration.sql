/*
  Warnings:

  - You are about to drop the column `createdBy` on the `archives` table. All the data in the column will be lost.
  - Added the required column `created_by` to the `archives` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `archives` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_by` to the `archives` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "archives_createdBy_title_register_number_date_exported_or_r_idx";

-- AlterTable
ALTER TABLE "archives" DROP COLUMN "createdBy",
ADD COLUMN     "created_by" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "archives_created_by_title_register_number_date_exported_or__idx" ON "archives"("created_by", "title", "register_number", "date_exported_or_received");

-- AddForeignKey
ALTER TABLE "archives" ADD CONSTRAINT "archives_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "archives" ADD CONSTRAINT "archives_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
