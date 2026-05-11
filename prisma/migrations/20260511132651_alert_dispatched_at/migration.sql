-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "alerts_companyId_status_dispatchedAt_idx" ON "alerts"("companyId", "status", "dispatchedAt");
