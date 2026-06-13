-- CreateEnum
CREATE TYPE "PlanChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "plan_change_requests" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "requestedPlanId" INTEGER NOT NULL,
    "currentPlanId" INTEGER,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "receiptUrl" TEXT,
    "receiptFileName" TEXT,
    "notes" TEXT,
    "status" "PlanChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plan_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_change_requests_companyId_status_idx" ON "plan_change_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "plan_change_requests_status_createdAt_idx" ON "plan_change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "plan_change_requests_deletedAt_idx" ON "plan_change_requests"("deletedAt");

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_currentPlanId_fkey" FOREIGN KEY ("currentPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
