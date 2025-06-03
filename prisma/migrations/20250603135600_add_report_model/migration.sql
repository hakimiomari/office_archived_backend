-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "Report" (
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

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
