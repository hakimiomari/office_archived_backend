-- ================================================================
-- Subscription layer: Plan / PlanModule / PlanFeature / PlanLimit
--   + per-tenant CompanySubscription, plus a backfill block that
--   gives every existing Company an ACTIVE Basic subscription.
-- ================================================================

-- CreateEnum
CREATE TYPE "ModuleCode" AS ENUM (
  'INVENTORY', 'SALES', 'EMPLOYEES', 'CATEGORIES',
  'ALERTS', 'STOCK_COUNTS', 'ACCOUNTING', 'BANKING',
  'USERS', 'ROLES'
);

-- CreateEnum
CREATE TYPE "FeatureCode" AS ENUM (
  'INVENTORY_REPORTS', 'INVENTORY_PROFIT_REPORT',
  'SALES_PDF_EXPORT', 'CUSTOMER_STATEMENT_PDF',
  'ACCOUNTING_LEDGER', 'ACCOUNTING_JOURNALS',
  'BANK_RECONCILIATION', 'AUDIT_LOGS'
);

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'ACTIVE', 'EXPIRED', 'CANCELLED', 'PAST_DUE'
);

-- CreateTable
CREATE TABLE "plans" (
  "id"           SERIAL PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "description"  TEXT,
  "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "yearlyPrice"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3)
);

CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");
CREATE INDEX "plans_isActive_sortOrder_idx" ON "plans"("isActive", "sortOrder");
CREATE INDEX "plans_deletedAt_idx" ON "plans"("deletedAt");

-- CreateTable
CREATE TABLE "plan_modules" (
  "id"         SERIAL PRIMARY KEY,
  "planId"     INTEGER NOT NULL,
  "moduleCode" "ModuleCode" NOT NULL
);

CREATE INDEX "plan_modules_moduleCode_idx" ON "plan_modules"("moduleCode");
CREATE UNIQUE INDEX "plan_modules_planId_moduleCode_key" ON "plan_modules"("planId", "moduleCode");

-- CreateTable
CREATE TABLE "plan_features" (
  "id"          SERIAL PRIMARY KEY,
  "planId"      INTEGER NOT NULL,
  "featureCode" "FeatureCode" NOT NULL
);

CREATE INDEX "plan_features_featureCode_idx" ON "plan_features"("featureCode");
CREATE UNIQUE INDEX "plan_features_planId_featureCode_key" ON "plan_features"("planId", "featureCode");

-- CreateTable
CREATE TABLE "plan_limits" (
  "id"            SERIAL PRIMARY KEY,
  "planId"        INTEGER NOT NULL,
  "maxUsers"      INTEGER,
  "maxWarehouses" INTEGER,
  "maxItems"      INTEGER,
  "maxEmployees"  INTEGER,
  "storageGb"     INTEGER
);

CREATE UNIQUE INDEX "plan_limits_planId_key" ON "plan_limits"("planId");

-- CreateTable
CREATE TABLE "company_subscriptions" (
  "id"        SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "planId"    INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate"   TIMESTAMP(3),
  "status"    "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX "company_subscriptions_companyId_idx" ON "company_subscriptions"("companyId");
CREATE INDEX "company_subscriptions_status_idx" ON "company_subscriptions"("status");
CREATE INDEX "company_subscriptions_endDate_idx" ON "company_subscriptions"("endDate");
CREATE INDEX "company_subscriptions_deletedAt_idx" ON "company_subscriptions"("deletedAt");

-- AddForeignKey
ALTER TABLE "plan_modules"
  ADD CONSTRAINT "plan_modules_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_features"
  ADD CONSTRAINT "plan_features_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_limits"
  ADD CONSTRAINT "plan_limits_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_subscriptions"
  ADD CONSTRAINT "company_subscriptions_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_subscriptions"
  ADD CONSTRAINT "company_subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ================================================================
-- BACKFILL: insert the three core plans + give every existing
-- company an ACTIVE Basic subscription. Idempotent — re-runs are
-- safe because the seed service does the same upsert on boot.
-- ================================================================

-- Plans (idempotent insert via NOT EXISTS guard on the unique slug)
INSERT INTO "plans" ("name", "slug", "description", "monthlyPrice", "yearlyPrice", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'Basic',   'basic',   'Core inventory + sales + employees',                  0, 0, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'basic');
INSERT INTO "plans" ("name", "slug", "description", "monthlyPrice", "yearlyPrice", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'Premium', 'premium', 'Adds alerts + stock counts + key reports',           0, 0, true, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'premium');
INSERT INTO "plans" ("name", "slug", "description", "monthlyPrice", "yearlyPrice", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'Pro',     'pro',     'All modules + accounting + banking + audit',         0, 0, true, 2, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'pro');

-- Plan modules (Basic: core; Premium: + alerts + stock_counts; Pro: all)
INSERT INTO "plan_modules" ("planId", "moduleCode")
SELECT p.id, m::"ModuleCode"
FROM "plans" p
CROSS JOIN unnest(ARRAY['INVENTORY','SALES','EMPLOYEES','CATEGORIES','USERS','ROLES']) AS m
WHERE p.slug = 'basic'
ON CONFLICT ("planId", "moduleCode") DO NOTHING;

INSERT INTO "plan_modules" ("planId", "moduleCode")
SELECT p.id, m::"ModuleCode"
FROM "plans" p
CROSS JOIN unnest(ARRAY['INVENTORY','SALES','EMPLOYEES','CATEGORIES','ALERTS','STOCK_COUNTS','USERS','ROLES']) AS m
WHERE p.slug = 'premium'
ON CONFLICT ("planId", "moduleCode") DO NOTHING;

INSERT INTO "plan_modules" ("planId", "moduleCode")
SELECT p.id, m::"ModuleCode"
FROM "plans" p
CROSS JOIN unnest(ARRAY['INVENTORY','SALES','EMPLOYEES','CATEGORIES','ALERTS','STOCK_COUNTS','ACCOUNTING','BANKING','USERS','ROLES']) AS m
WHERE p.slug = 'pro'
ON CONFLICT ("planId", "moduleCode") DO NOTHING;

-- Plan features
INSERT INTO "plan_features" ("planId", "featureCode")
SELECT p.id, f::"FeatureCode"
FROM "plans" p
CROSS JOIN unnest(ARRAY['INVENTORY_REPORTS','SALES_PDF_EXPORT','CUSTOMER_STATEMENT_PDF']) AS f
WHERE p.slug = 'premium'
ON CONFLICT ("planId", "featureCode") DO NOTHING;

INSERT INTO "plan_features" ("planId", "featureCode")
SELECT p.id, f::"FeatureCode"
FROM "plans" p
CROSS JOIN unnest(ARRAY['INVENTORY_REPORTS','INVENTORY_PROFIT_REPORT','SALES_PDF_EXPORT','CUSTOMER_STATEMENT_PDF','ACCOUNTING_LEDGER','ACCOUNTING_JOURNALS','BANK_RECONCILIATION','AUDIT_LOGS']) AS f
WHERE p.slug = 'pro'
ON CONFLICT ("planId", "featureCode") DO NOTHING;

-- Plan limits
INSERT INTO "plan_limits" ("planId", "maxUsers", "maxWarehouses", "maxItems", "maxEmployees", "storageGb")
SELECT p.id, 5,  1,   500,  10, 1   FROM "plans" p WHERE p.slug = 'basic'
ON CONFLICT ("planId") DO NOTHING;
INSERT INTO "plan_limits" ("planId", "maxUsers", "maxWarehouses", "maxItems", "maxEmployees", "storageGb")
SELECT p.id, 25, 5,   5000, 50, 10  FROM "plans" p WHERE p.slug = 'premium'
ON CONFLICT ("planId") DO NOTHING;
INSERT INTO "plan_limits" ("planId", "maxUsers", "maxWarehouses", "maxItems", "maxEmployees", "storageGb")
SELECT p.id, NULL, NULL, NULL, NULL, NULL FROM "plans" p WHERE p.slug = 'pro'
ON CONFLICT ("planId") DO NOTHING;

-- Backfill every existing Company with an ACTIVE Basic subscription
INSERT INTO "company_subscriptions" ("companyId", "planId", "startDate", "endDate", "status", "autoRenew", "createdAt", "updatedAt")
SELECT c.id, (SELECT id FROM "plans" WHERE "slug" = 'basic'), NOW(), NULL, 'ACTIVE', true, NOW(), NOW()
FROM "companies" c
WHERE NOT EXISTS (
  SELECT 1 FROM "company_subscriptions" s
  WHERE s."companyId" = c.id
    AND s."status" = 'ACTIVE'
    AND s."deletedAt" IS NULL
);
