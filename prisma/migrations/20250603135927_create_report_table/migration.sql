/*
  Warnings:

  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.

*/
--ReportType
CREATE TYPE "ReportType" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "memo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "register_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "file" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" "ReportType" NOT NULL DEFAULT 'in',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_createdBy_title_register_number_date_idx" ON "reports"("createdBy", "title", "register_number", "date");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
