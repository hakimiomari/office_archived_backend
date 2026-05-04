-- =============================================================
-- Multi-tenancy: introduce Company, UserRole, and tenant scoping.
-- All existing data is assigned to a default Company (id=1).
-- =============================================================

-- New enum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER');

-- New companies table
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- Seed a default company so existing rows have a tenant to belong to.
INSERT INTO "companies" ("id", "name", "slug", "isActive", "updatedAt")
VALUES (1, 'Default Company', 'default', true, NOW())
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('companies', 'id'),
              GREATEST((SELECT MAX(id) FROM companies), 1));

-- Users: add userRole + companyId. The first user becomes SUPER_ADMIN, the
-- rest are scoped to the default company as COMPANY_USERs.
ALTER TABLE "users" ADD COLUMN "userRole" "UserRole" NOT NULL DEFAULT 'COMPANY_USER';
ALTER TABLE "users" ADD COLUMN "companyId" INTEGER;
UPDATE "users" SET "companyId" = 1;
UPDATE "users" SET "userRole" = 'SUPER_ADMIN' WHERE id = (SELECT MIN(id) FROM "users");
CREATE INDEX "users_companyId_idx" ON "users"("companyId");
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- Generic helper: add a NOT NULL companyId column defaulting to 1, FK + index.
-- We do it column-by-column because Prisma migrations don't have functions.

-- items
ALTER TABLE "items" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "items" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "items_sku_key";
CREATE UNIQUE INDEX "items_companyId_sku_key" ON "items"("companyId", "sku");
CREATE INDEX "items_companyId_idx" ON "items"("companyId");
ALTER TABLE "items" ADD CONSTRAINT "items_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- warehouses
ALTER TABLE "warehouses" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "warehouses" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "warehouses_companyId_idx" ON "warehouses"("companyId");
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- inventory_stock
ALTER TABLE "inventory_stock" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inventory_stock" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "inventory_stock_companyId_idx" ON "inventory_stock"("companyId");
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- inventory_batches
ALTER TABLE "inventory_batches" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inventory_batches" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "inventory_batches_companyId_idx" ON "inventory_batches"("companyId");
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stock_movements" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "stock_movements_companyId_idx" ON "stock_movements"("companyId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- alerts
ALTER TABLE "alerts" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "alerts" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "alerts_companyId_idx" ON "alerts"("companyId");
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- stock_counts: rename existing reference unique to a tenant-scoped one
ALTER TABLE "stock_counts" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stock_counts" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "stock_counts_reference_key";
CREATE UNIQUE INDEX "stock_counts_companyId_reference_key" ON "stock_counts"("companyId", "reference");
CREATE INDEX "stock_counts_companyId_idx" ON "stock_counts"("companyId");
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- stock_count_lines
ALTER TABLE "stock_count_lines" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stock_count_lines" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "stock_count_lines_companyId_idx" ON "stock_count_lines"("companyId");
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- categories: drop old slug unique, add tenant-scoped slug + (companyId, parentId, name) unique
ALTER TABLE "categories" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "categories" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "categories_slug_key";
DROP INDEX IF EXISTS "categories_parentId_name_key";
CREATE UNIQUE INDEX "categories_companyId_slug_key" ON "categories"("companyId", "slug");
CREATE UNIQUE INDEX "categories_companyId_parentId_name_key" ON "categories"("companyId", "parentId", "name");
CREATE INDEX "categories_companyId_idx" ON "categories"("companyId");
ALTER TABLE "categories" ADD CONSTRAINT "categories_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- suppliers
ALTER TABLE "suppliers" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "suppliers" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "suppliers_companyId_idx" ON "suppliers"("companyId");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- purchases
ALTER TABLE "purchases" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchases" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "purchases_companyId_idx" ON "purchases"("companyId");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- purchase_items
ALTER TABLE "purchase_items" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_items" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "purchase_items_companyId_idx" ON "purchase_items"("companyId");
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- supplier_payments
ALTER TABLE "supplier_payments" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "supplier_payments" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "supplier_payments_companyId_idx" ON "supplier_payments"("companyId");
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- customers
ALTER TABLE "customers" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "customers" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- sales: switch invoiceNo unique from global to (companyId, invoiceNo)
ALTER TABLE "sales" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sales" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "sales_invoiceNo_key";
CREATE UNIQUE INDEX "sales_companyId_invoiceNo_key" ON "sales"("companyId", "invoiceNo");
CREATE INDEX "sales_companyId_idx" ON "sales"("companyId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- sale_items
ALTER TABLE "sale_items" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sale_items" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "sale_items_companyId_idx" ON "sale_items"("companyId");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- payments
ALTER TABLE "payments" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payments" ALTER COLUMN "companyId" DROP DEFAULT;
CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- departments: drop global name unique, add tenant-scoped one
ALTER TABLE "departments" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "departments" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "departments_name_key";
CREATE UNIQUE INDEX "departments_companyId_name_key" ON "departments"("companyId", "name");
CREATE INDEX "departments_companyId_idx" ON "departments"("companyId");
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- employees: drop global email unique, add tenant-scoped one
ALTER TABLE "employees" ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "employees" ALTER COLUMN "companyId" DROP DEFAULT;
DROP INDEX IF EXISTS "employees_email_key";
CREATE UNIQUE INDEX "employees_companyId_email_key" ON "employees"("companyId", "email");
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;
