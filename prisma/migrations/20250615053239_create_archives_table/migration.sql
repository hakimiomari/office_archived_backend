-- CreateEnum
CREATE TYPE "ArchiveType" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "archives" (
    "id" SERIAL NOT NULL,
    "memo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "register_number" TEXT NOT NULL,
    "date_exported_or_received" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "file_number" INTEGER NOT NULL,
    "archive_category" TEXT NOT NULL,
    "type" "ArchiveType" NOT NULL DEFAULT 'in',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,

    CONSTRAINT "archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archives_createdBy_title_register_number_date_exported_or_r_idx" ON "archives"("createdBy", "title", "register_number", "date_exported_or_received");

-- AddForeignKey
ALTER TABLE "archives" ADD CONSTRAINT "archives_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
