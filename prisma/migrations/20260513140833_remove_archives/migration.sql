/*
  Warnings:

  - You are about to drop the `archives` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "archives" DROP CONSTRAINT "archives_created_by_fkey";

-- DropForeignKey
ALTER TABLE "archives" DROP CONSTRAINT "archives_updated_by_fkey";

-- DropTable
DROP TABLE "archives";

-- DropEnum
DROP TYPE "ArchiveType";
