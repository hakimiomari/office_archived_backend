/*
  Warnings:

  - Added the required column `group_name` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdBy` to the `roles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "group_name" TEXT NOT NULL,
ADD COLUMN     "label" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "createdBy" INTEGER NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "permissions_created_by_idx" ON "permissions"("created_by");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
