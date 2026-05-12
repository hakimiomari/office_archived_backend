# Zermatoon — Backend System Overview

> **Backend half** of the system overview. The frontend-specific structure
> lives in [`../office_archived_frontend/SYSTEM_OVERVIEW.md`](../office_archived_frontend/SYSTEM_OVERVIEW.md).
> Cross-cutting sections (tech stack, multi-tenancy model, auth lifecycle,
> running instructions, credentials) are duplicated into both halves so each
> is self-contained. For the *current* state of architectural upgrades, see
> [`STATUS.md`](STATUS.md) in this directory.
>
> Hand this file to any AI agent (ChatGPT, Claude, etc.) so it can extend the
> backend — for example with an invoice-tracking or payment-tracking module —
> without breaking existing conventions.

---

## 1. Tech stack

### Backend (`office_archived_backend/`)
- **Runtime**: Node.js + TypeScript
- **Framework**: NestJS (modular, decorator-driven)
- **ORM**: Prisma (PostgreSQL)
- **Auth**: JWT (access + refresh) in cookies, plus Google OAuth
- **Cache / blacklist**: Redis (refresh-token blacklist)
- **Object storage**: MinIO (profile pictures, etc.)
- **PDF generation**: pdfkit (invoices, customer statements, sales reports)
- **Cron**: `@nestjs/schedule` (alerts hourly + dead-stock daily)
- **Events**: `@nestjs/event-emitter` (typed domain event bus)
- **API docs**: Swagger (`@nestjs/swagger`)
- **Validation**: `class-validator` + `class-transformer`

### Frontend (`office_archived_frontend/`)
- **Framework**: Next.js 15 (App Router, RSC where possible, client components elsewhere)
- **UI**: shadcn/ui (Radix primitives) + Tailwind CSS
- **i18n**: `next-intl` (en, fa, ps — Pashto/Dari are RTL)
- **Charts**: Recharts
- **Tables**: `@tanstack/react-table`
- **Forms / state**: native React state + small custom hooks (no Formik / RHF)
- **HTTP**: Axios with global request interceptor for auth + tenant scoping

---

## 2. High-level architecture

### Multi-tenancy
- Single PostgreSQL schema, **shared database** with a `companyId` column on every business model.
- `Company` table is the tenant root; every business row belongs to exactly one company except the SUPER_ADMIN user (whose `companyId` is `null`).
- Three user-tenancy roles (separate from the existing role/permission system):
  - `SUPER_ADMIN` — `companyId = null`. Sees everything across tenants. Manages companies + users in any tenant.
  - `COMPANY_ADMIN` — full powers within their own company.
  - `COMPANY_USER` — restricted by their `Role`-based permissions, scoped to their own company.

### Tenant-scoping enforcement (defence in depth)
1. **JWT** carries `userRole` + `companyId` (informational; can be stale).
2. **AuthGuard** on every authenticated request **re-fetches** `userRole` / `companyId` / `isActive` from the DB and overwrites `req.user` — so deactivations and role changes apply on the next request, no logout needed.
3. **TenantInterceptor** (global `APP_INTERCEPTOR`) wraps each request handler in an `AsyncLocalStorage` context populated from `req.user`. SUPER_ADMINs may send `X-Tenant-Company-Id: N` (header) to scope to one tenant; non-SUPER_ADMINs' header is ignored. Also assigns/echoes `X-Request-Id` and `X-Show-Deleted`.
4. **Prisma client extension** (in `PrismaService`) auto-injects `WHERE companyId = X` on every read / update / delete, `data.companyId = X` on every create (recursively into known tenant-child nested writes), and `deletedAt: null` on reads/updates. `delete` is rewritten to a soft-delete `update`. Forwarded through `$transaction` too.
5. **Raw SQL** must go through `TenantQueryService` (`src/tenant/tenant-query.service.ts`), which makes the `${TENANT_FILTER}` clause mandatory — `$queryRaw` / `$executeRaw` outside `src/tenant/` fails CI (`npm run lint:raw-sql`).
6. **`SuperAdminGuard`** for routes that should reject company users entirely (`/admin/companies`, `/admin/debug/*`, `/admin/audit-logs`, `/accounting/*`, `/banking/*` for now).

### Existing role / permission system (orthogonal)
- `Role` table with M:N to `Permission` and to `User`. Permissions are strings like `inventory.read`, `sale.create`.
- `@Permissions('inventory.read')` decorator + `PermissionGuard` enforce per-route checks.
- This system controls **what actions** a user can perform. The `userRole` enum controls **which company's data** they can see. They compose.

---

## 3. Database schema

### Enums
```
UserRole          : SUPER_ADMIN | COMPANY_ADMIN | COMPANY_USER
ItemCategory      : OFFICE_SUPPLIES | IT_EQUIPMENT | PROJECT_MATERIALS
                   | CONSUMABLES | ASSETS | OTHER
StockMovementType : IN | OUT | TRANSFER | ADJUSTMENT
StockMovementReference : PURCHASE | SALE | MANUAL | TRANSFER | ADJUSTMENT
PurchaseStatus    : PENDING | RECEIVED | CANCELLED
AlertType         : LOW_STOCK | OVERSTOCK | DEAD_STOCK | REORDER
AlertStatus       : OPEN | ACKNOWLEDGED | RESOLVED
StockCountStatus  : DRAFT | IN_PROGRESS | COMPLETED | CANCELLED
EmployeeStatus    : ACTIVE | INACTIVE | ON_LEAVE | TERMINATED
PaymentStatus     : PAID | PARTIAL | UNPAID
PaymentMethod     : CASH | BANK | MOBILE | CREDIT | OTHER
SaleStatus        : COMPLETED | CANCELLED
AccountType       : ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
BankTransactionDirection : CREDIT | DEBIT
BankTransactionStatus    : UNMATCHED | MATCHED | IGNORED
ReconciliationStatus     : OPEN | COMPLETED
```

### Tenant-aware models

> Every model below has `companyId Int NOT NULL` plus `company Company @relation(...)` and `deletedAt DateTime?`. A new tenant model **must** include the same and be added to `TENANT_MODELS` (see §4 checklist).

#### `Company` (the tenant root)
```
id, name (unique), slug (unique), isActive, timezone, notes,
createdAt, updatedAt
```

#### `User` (auth subject — companyId is *nullable* for SUPER_ADMIN)
```
id, name, email (unique), password, googleId,
profile_picture, isActive,
userRole UserRole @default(COMPANY_USER),
companyId Int? (null only for SUPER_ADMIN),
roles Role[] (M:N), permissions Permission[],
created_by, updated_by, created_at, updated_at
```

#### `Role`, `Permission`, `AuditLog` (global / cross-tenant, NOT auto-scoped)
```
Role: id, name (unique), description, permissions Permission[], users User[]
Permission: id, name (unique), group_name, label
AuditLog: id, companyId?, userId?, email?, action, entity?, entityId?,
          before (Json?), after (Json?), ipAddress?, userAgent?, requestId?,
          notes?, createdAt
          @@index([companyId, createdAt]), ([entity, entityId]), ([userId]), ([action])
```

#### Inventory module
```
Category    : id, name, slug, description, parentId (self),
              UNIQUE (companyId, parentId, name) and (companyId, slug)
Item        : id, name, sku, category (enum), categoryId (FK),
              unit, description, minStock, maxStock, reorderPoint,
              reorderQuantity, leadTimeDays, salePrice, purchasePrice
              UNIQUE (companyId, sku); composite idx (companyId, name)
Warehouse   : id, name, location
InventoryStock  : id, itemId, warehouseId, quantity, version (optimistic-lock)
                 UNIQUE (itemId, warehouseId); composite idx (companyId, itemId)
InventoryBatch  : id, itemId, warehouseId, batchNo, quantity, unitCost,
                 receivedAt, expiryDate, purchaseId (FIFO costing)
StockMovement   : id, itemId, type (enum), quantity, unitCost, batchId,
                 sourceWarehouseId, targetWarehouseId,
                 referenceType (enum), referenceId, purchaseId,
                 userId, idempotencyKey (unique), notes, createdAt
                 composite idx (companyId, type, createdAt),
                              (companyId, itemId, createdAt),
                              (companyId, referenceType, referenceId)
Alert       : id, type (enum), status (enum), itemId, warehouseId?,
              message, threshold, currentValue, metadata (JSON),
              dispatchedAt, createdAt, resolvedAt
StockCount      : id, reference, warehouseId, status (enum), notes,
                 startedAt, completedAt, createdBy
                 UNIQUE (companyId, reference)
StockCountLine  : id, stockCountId, itemId, expectedQty, countedQty,
                 variance, notes
                 UNIQUE (stockCountId, itemId)
Supplier     : id, name, contact (person), email, phone, address, totalOwed
Purchase     : id, supplierId, referenceNo, totalAmount, paidAmount,
              remainingAmount, paymentStatus, purchaseDate, status,
              notes, createdBy
              composite idx (companyId, status, purchaseDate)
PurchaseItem : id, purchaseId, itemId, quantity, price
SupplierPayment : id, supplierId, purchaseId?, amount, method,
                 paymentDate, referenceNo, notes, createdBy
```

#### Sales / billing module
```
Customer : id, name, phone, email, address, creditLimit, totalOwed, notes
           composite idx (companyId, name)
Sale     : id, invoiceNo, customerId, warehouseId, employeeId,
          subtotal, discount, tax, totalAmount, paidAmount, remainingAmount,
          paymentStatus (enum), paymentMethod (enum), saleStatus (enum),
          saleDate, dueDate, notes
          UNIQUE (companyId, invoiceNo)
          composite idx (companyId, saleDate),
                       (companyId, paymentStatus, dueDate),
                       (companyId, customerId, saleDate),
                       (companyId, saleStatus, saleDate)
SaleItem : id, saleId, itemId, quantity, unitPrice, discount, lineTotal
Payment  : id, saleId, amount, method, paymentDate, referenceNo,
          notes, employeeId, createdBy; bankTransactions BankTransaction[]
          composite idx (companyId, paymentDate)
```

#### Employee / HR module
```
Department : id, name, description
            UNIQUE (companyId, name)
Employee   : id, firstName, lastName, email, phone, departmentId,
            designation, hireDate, status (enum), profilePicture,
            address, notes, createdBy
            UNIQUE (companyId, email)
```

#### Accounting module (§5.1 of the upgrade roadmap — shipped)
```
Account      : id, code, name, type (AccountType), parentId?, isActive, notes
               UNIQUE (companyId, code); idx (companyId, type)
JournalEntry : id, entryNo, date, description, sourceType?, sourceId?,
               isLocked, lockedAt, createdBy
               UNIQUE (companyId, entryNo); idx (companyId, date), (sourceType, sourceId)
JournalLine  : id, journalEntryId, accountId, debit, credit, description?
```
Standard chart of accounts auto-seeded on Company create (codes 1000 Cash,
1100 Bank, 1200 AR, 1300 Inventory, 2000 AP, 2100 Tax Payable,
3000 Retained Earnings, 4000 Sales Revenue, 4100 Sales Discount, 5000 COGS,
6000 Operating Expenses, 6100 Inventory Adjustment).

#### Banking / reconciliation module (§5.2 — shipped)
```
BankAccount     : id, name, accountNumber?, currency, provider?,
                  openingBalance, notes?, isActive
                  UNIQUE (companyId, name)
BankTransaction : id, bankAccountId, statementDate, direction (enum), amount,
                  description?, reference?, raw (Json?), status (enum),
                  matchedPaymentId?, matchedSupplierPaymentId?, matchedAt?, matchedBy?
                  idx (companyId, status, statementDate)
Reconciliation  : id, bankAccountId, periodStart, periodEnd, status (enum),
                  openingBalance, closingBalance, notes?, createdBy?, completedAt?
```

### Migration history (`prisma/migrations/`)
Key migrations:
- `20260427125626_inventory_sales_baseline/` — consolidated baseline that creates inventory/sales/employees tables.
- `20260427150000_multitenancy/` — adds `Company`, `UserRole`, `companyId` columns + FKs + composite uniques. Backfills existing data to `Default Company (id=1)` and promotes user id=1 to SUPER_ADMIN.
- `…_soft_delete` — `deletedAt DateTime?` on every tenant model.
- `…_audit_log` — `audit_logs` table.
- `…_composite_indexes` — 12 composite indexes for hot report paths.
- `…_alert_dispatched_at` — `Alert.dispatchedAt`.
- `…_accounting_layer` — Account / JournalEntry / JournalLine.
- `…_bank_reconciliation` — BankAccount / BankTransaction / Reconciliation.

### Seed (`prisma/seed.service.ts`)
- Permissions (one row per `module.action`).
- Admin user `hakimikamranullah@gmail.com` with password `admin`, **upserted as `SUPER_ADMIN`**.
- 3 roles: `admin` (all permissions), `manager` (inventory + employees + sales w/o user-mgmt), `viewer` (read-only).
- Admin role assigned to admin user.

---

## 4. Backend structure

### Module map
```
src/
├── app.module.ts               # Wires every feature module + global TenantInterceptor + EventEmitterModule
├── main.ts                     # Bootstrap: cookies, CORS, validation pipe, Swagger
├── config/                     # ConfigModule + env validation (Joi)
│
├── auth/                       # Sign-in, Google login, JWT, AuthGuard
│   ├── auth.controller.ts      # /auth/sign-in, /auth/logout, /auth/refresh-token
│   ├── guard/auth.guard.ts     # ★ Re-fetches userRole/companyId/isActive from DB on every request
│   ├── providers/sign-in.provider.ts   # emits auth.login audit row
│   ├── providers/token.provider.ts     # JWT mint + refresh; payload carries userRole + companyId
│   └── social/google-authentication.{controller,service}.ts
│
├── users/                      # User CRUD + profile
│   ├── users.controller.ts     # /user/create, /user/list, /user/profile, /user/:id, …
│   ├── users.service.ts        # findAll() manually scopes by companyId
│   └── providers/create-user.provider.ts   # ★ enforces tenancy on create
│
├── tenant/                     # Tenancy infrastructure
│   ├── tenant-context.ts       # AsyncLocalStorage + getTenantContext + isSuperAdmin + showDeleted
│   ├── tenant.interceptor.ts   # APP_INTERCEPTOR: wraps each request in the context; reads X-Tenant-Company-Id / X-Request-Id / X-Show-Deleted
│   ├── tenant-prisma-extension.ts  # Auto-scopes Prisma for TENANT_MODELS: companyId, deletedAt, delete→soft-delete, nested-write injection, cross-tenant-attempt counters, audit emit
│   ├── tenant-query.service.ts # ★ the ONLY sanctioned place for $queryRaw / $executeRaw
│   ├── tenant-create.ts        # tenantCreate<T> / tenantCreateStrict<T> — replaces `data: {…} as any`
│   ├── tenant.service.ts       # forEachCompany / runForCompany — cron + queue tenant re-entry
│   ├── tenant-logger.ts        # TenantLogger — prefixes [req:<id>][company:<id>]
│   ├── audit.service.ts        # AuditService.log + findAll; registers the audit sink
│   ├── audit-sink.ts           # module-level seam between the Prisma extension and AuditService
│   ├── tenant.module.ts        # @Global — exports TenantService, TenantQueryService, AuditService
│   ├── tenant-debug.controller.ts  # GET/POST /admin/debug/tenant-stats
│   ├── audit-log.controller.ts # GET /admin/audit-logs (SUPER_ADMIN)
│   └── super-admin.guard.ts    # Blocks non-SUPER_ADMIN
│
├── events/                     # Typed domain event bus
│   ├── event-types.ts          # EVENTS constants + payload interfaces + PayloadByEvent
│   ├── event-bus.service.ts    # EventBus.emit<E>(name, payload) — typed wrapper around EventEmitter2
│   ├── events.module.ts        # @Global — exports EventBus
│   └── listeners/event-logger.listener.ts  # demo listener (re-enters tenant context)
│
├── companies/                  # SUPER_ADMIN-only tenant management
│   ├── companies.controller.ts # /admin/companies (SuperAdminGuard)
│   └── companies.service.ts    # CRUD + stats(); create() auto-seeds the chart of accounts
│
├── prisma/
│   ├── prisma.service.ts       # Proxies model accessors AND $transaction to the extended client
│   └── prisma.module.ts
│
├── inventory/                  # Items, warehouses, suppliers, purchases, stock movements
│   ├── inventory.controller.ts # all under /inventory/*
│   ├── inventory-core.service.ts   # atomicDecrement/Increment, FIFO, addBatch, evaluateAlerts
│   ├── items/items.service.ts
│   ├── warehouses/warehouses.service.ts
│   ├── suppliers/suppliers.service.ts
│   ├── movements/movements.service.ts   # stockIn/Out/Transfer/Adjustment; emits stock.moved
│   ├── purchasing/purchasing.service.ts # purchases + supplier payments; emits purchase.received / supplier_payment.received
│   ├── reports/inventory-reports.service.ts  # raw SQL via TenantQueryService
│   └── dto/*.dto.ts
│
├── sales/                      # Sales, customers, payments, reports
│   ├── sales.controller.ts     # /sales/*, /sales/customers/*, /sales/payments — ONE controller, route paths stable
│   ├── customers/customers.service.ts
│   ├── invoices/invoices.service.ts     # createSale: atomic decrement + FIFO; emits sale.created / sale.cancelled
│   ├── payments/payments.service.ts     # emits payment.received
│   ├── reports/sales-reports.service.ts # summary + period reports; raw SQL via TenantQueryService
│   ├── invoice-pdf.service.ts  # PDF renderers: invoice, customer statement, sales report
│   └── dto/*.dto.ts
│
├── accounting/                 # §5.1 — general ledger
│   ├── chart-of-accounts.service.ts   # ACCOUNT_CODES + seedDefault (idempotent) + backfillAll
│   ├── ledger.service.ts       # balanced JournalEntry poster, idempotent by (sourceType, sourceId)
│   ├── journal.listener.ts     # subscribes to sale/payment/purchase events → postXxx
│   ├── accounting.controller.ts # /accounting/* (SuperAdminGuard)
│   └── accounting.module.ts
│
├── banking/                    # §5.2 — bank reconciliation
│   ├── bank-accounts.service.ts
│   ├── bank-transactions.service.ts    # create / import / match / unmatch / ignore / auto-match
│   ├── reconciliations.service.ts      # open / close (book-balance check) / computeBookBalance
│   ├── banking.controller.ts   # /banking/* (SuperAdminGuard)
│   └── banking.module.ts
│
├── notifications/              # §5.3 — alert dispatch
│   ├── notification-channel.ts # NotificationChannel interface + NOTIFICATION_CHANNELS token
│   ├── channels/log.channel.ts # always-on structured log
│   ├── channels/webhook.channel.ts  # POSTs to ALERT_WEBHOOK_URL (Slack format via ALERT_WEBHOOK_FORMAT=slack)
│   ├── notification-dispatcher.service.ts  # @OnEvent(alert.triggered) → fan out to channels
│   └── notifications.module.ts
│
├── employees/                  # Employees + departments
├── categories/                 # Hierarchical product categories
├── alerts/                     # LOW/OVERSTOCK/REORDER/DEAD_STOCK alerts + cron scanners (forEachCompany) + dispatchOpen (emits alert.triggered)
├── stock-counts/               # Cycle-count workflow with variance reconciliation
├── roles/                      # Role + Permission CRUD
├── redis/                      # RedisService for refresh-token blacklist
├── minio/                      # MinIO upload service
└── guard/                      # PermissionGuard + @Permissions decorator
```

### Adding a new module — checklist
1. **Add the model** in `prisma/schema.prisma`. **Include `companyId Int` + `company Company @relation(...)` + `deletedAt DateTime?`** plus `@@index([companyId])`, `@@index([deletedAt])`, and any composite uniques (most include `(companyId, externalId)` for tenant-scoped uniqueness). Add the back-relation `<plural> X[]` on `Company`.
2. **Add the model name to `TENANT_MODELS`** in `src/tenant/tenant-prisma-extension.ts` — without this the auto-scoping doesn't apply. (CI guard `npm run lint:tenant-models` fails the build if you forget.) Add it to `AUDITED_MODELS` too if writes to it are operationally significant.
3. **Generate + apply migration**: `npx prisma migrate dev --name <change>`.
4. Create the standard Nest module (`<module>.controller.ts`, `<module>.service.ts`, `<module>.module.ts`, `<module>.dto.ts` or `dto/`).
5. Register the module in `src/app.module.ts` (`imports`).
6. For each new permission (e.g. `invoice.create`): add to the `permissions` array in `prisma/seed.service.ts`, use `@Permissions('invoice.create')` on the route, and decide which seeded `Role` (admin/manager/viewer) gets it.
7. **Use `this.prisma.<model>.findMany()` etc. as normal.** The extension auto-injects `companyId` (reads + creates, including nested) and `deletedAt: null`. You DO NOT need `where: { companyId }` in service code.
8. For `$queryRaw`, **use `TenantQueryService.queryRaw(column, (TENANT) => Prisma.sql\`… WHERE ${TENANT} …\`)`** — never `prisma.$queryRaw` directly. (`npm run lint:raw-sql` enforces this.)
9. For `data:` create literals, use `tenantCreate<Prisma.XUncheckedCreateInput>({...})` (or `tenantCreateStrict<...>` for payloads with no nested writes) from `src/tenant/tenant-create.ts` — not `as any`.
10. For background work (cron, queue), wrap the body in `tenants.forEachCompany(async (companyId) => { … })` or `tenants.runForCompany(id, fn)`. Make crons idempotent. (`npm run lint:crons` enforces it.)

---

## 5. Full HTTP route catalogue

> Every authenticated route is gated by `AuthGuard` + `PermissionGuard` (or `SuperAdminGuard`). Permissions are listed where applicable. SUPER_ADMINs may send `X-Tenant-Company-Id: N` (header) to scope to a tenant, and `X-Show-Deleted: 1` to see soft-deleted rows. Every response carries `X-Request-Id`.

### Auth
- `POST /auth/sign-in` — email + password → sets `access_token` + `refresh_token` cookies; emits `auth.login` audit row.
- `POST /auth/logout` — blacklists the refresh token, clears cookies.
- `GET  /auth/refresh-token` — rotates tokens (401 if refresh token expired/blacklisted/missing).
- `POST /google-authentication/google-login` — Google ID-token exchange.

### Users (`/user`)
- `POST   /user/create`            `user.create` — body: `{ name, email, password, role, userRole?, companyId? }`
- `GET    /user/list`              `user.read`   — pagination + search; auto-scoped to caller's tenant
- `GET    /user/profile`           AuthGuard only — returns `{ id, name, email, userRole, companyId, company, roles[…], created_at, … }`
- `GET    /user/:id`               `user.read`
- `PATCH  /user/:id`               `user.update`
- `DELETE /user/:id`               `user.delete`
- `POST   /user/change-password`   AuthGuard
- `POST   /user/profile/upload-picture`   multipart
- `POST   /user/assign_role`       `role.update`

### Roles (`/roles`)
- Standard CRUD; permissions: `role.{create,read,update,delete}`.
- `GET /roles/permissions` — list of all permission strings (`role.read`).

### Companies (SUPER_ADMIN-only) (`/admin/companies`)
- `POST   /admin/companies`            create (auto-seeds the tenant's chart of accounts)
- `GET    /admin/companies`            list (search + pagination)
- `GET    /admin/companies/stats`      cross-tenant KPI counts for the admin dashboard
- `GET    /admin/companies/:id`        detail
- `PATCH  /admin/companies/:id`        update
- `PATCH  /admin/companies/:id/active` activate / deactivate (`{ isActive: boolean }`)
- `DELETE /admin/companies/:id`        hard-delete + cascade

### Tenancy admin (SUPER_ADMIN-only)
- `GET  /admin/debug/tenant-stats`        in-memory counters (scoped queries, blocked cross-tenant attempts)
- `POST /admin/debug/tenant-stats/reset`
- `GET  /admin/audit-logs`                paginated, filterable: action / entity / entityId / companyId / userId / date range

### Inventory (`/inventory`)
- **Reports** (`inventory.read`): `/reports/summary`, `/reports/current-stock`, `/reports/low-stock`, `/reports/movements`, `/reports/by-warehouse`, `/reports/monthly-usage`, `/reports/dead-stock`, `/reports/sales-velocity`, `/reports/turnover`, `/reports/profit-per-product`, `/reports/reorder-suggestions`
- **Stock operations** (`inventory.movement`):
  - `POST /inventory/stock/in`        body: `{ itemId, targetWarehouseId, quantity, unitCost?, batchNo?, expiryDate?, idempotencyKey?, notes? }`
  - `POST /inventory/stock/out`       body: `{ itemId, sourceWarehouseId, quantity, idempotencyKey?, notes? }`
  - `POST /inventory/stock/transfer`  body: `{ itemId, sourceWarehouseId, targetWarehouseId, quantity, notes? }`
  - `POST /inventory/stock/adjustment` body: `{ itemId, warehouseId, newQuantity, notes? }`
- `GET /inventory/movements` — list with filters
- **Warehouses, Suppliers, Items, Purchases, Supplier-payments**: standard `POST/GET/PATCH/DELETE` under `/inventory/<resource>`. Permissions follow `inventory.{create,read,update,delete}`.
- `POST /inventory/purchases/:id/receive` — atomically posts IN movements + creates FIFO batches; emits `purchase.received`.

### Categories (`/categories`)
- Standard CRUD + `GET /categories/tree` (returns nested tree).

### Alerts (`/alerts`)
- `GET    /alerts`                       list with filters (type/status/itemId/warehouseId)
- `POST   /alerts/scan`                  re-evaluate every item's thresholds
- `POST   /alerts/scan-dead-stock`       body: `{ days?: number }`
- `POST   /alerts/dispatch`              dispatch undispatched OPEN alerts (emits `alert.triggered`, stamps `dispatchedAt`)
- `POST   /alerts/:id/acknowledge`
- `POST   /alerts/:id/resolve`
- `DELETE /alerts/:id`

### Stock counts (`/stock-counts`)
- `POST   /stock-counts`                 open a count session
- `POST   /stock-counts/:id/submit`      record counted quantities
- `POST   /stock-counts/:id/complete`    body: `{ applyAdjustments?: boolean }`
- `POST   /stock-counts/:id/cancel`
- `GET    /stock-counts`, `/:id`, `DELETE /:id`
- `GET    /stock-counts/reports/variance?days=N`

### Sales (`/sales`)
- `GET /sales/summary`     dashboard KPIs (today/month revenue, profit, customers, totalPurchases, purchasesPaid, purchasesRemaining, realizedProfit, netProfit, projectedProfit, approximateProfit, …)
- `GET /sales/reports?period=daily|weekly|monthly|yearly&from&to&warehouseId`
- `GET /sales/reports/pdf` — same params, returns `application/pdf`
- `GET /sales/overdue`
- **Customers**: standard CRUD under `/sales/customers/*`, plus `GET /sales/customers/:id/report-pdf?from&to`
- **Payments**: `POST /sales/payments`, `GET /sales/payments`, `DELETE /sales/payments/:id`
- **Sales**: `POST /sales`, `GET /sales`, `GET /sales/:id`, `GET /sales/:id/pdf`, `PATCH /sales/:id`, `PATCH /sales/:id/cancel`, `DELETE /sales/:id`

### Employees (`/employees`)
- Standard CRUD + `GET /employees/summary`. Departments under `/employees/departments/*`.

### Accounting (SUPER_ADMIN-only) (`/accounting`)
- `GET  /accounting/chart`               list the active tenant's chart of accounts
- `POST /accounting/seed`                seed the default chart (idempotent)
- `POST /accounting/seed-all`            backfill the default chart for every active tenant
- `GET  /accounting/journal-entries`     list entries — filters: sourceType / sourceId / from / to
- `GET  /accounting/journal-entries/:id` entry + all lines

### Banking / reconciliation (SUPER_ADMIN-only) (`/banking`)
- `POST/GET/PATCH/DELETE /banking/accounts[/:id]`         bank account CRUD
- `POST /banking/transactions`                            single bank transaction
- `POST /banking/transactions/import`                     bulk import (JSON array)
- `GET  /banking/transactions`                            list — filters: bankAccountId / status / from / to
- `GET  /banking/transactions/:id`
- `POST /banking/transactions/:id/match`                  body: `{ paymentId? } | { supplierPaymentId? }`
- `POST /banking/transactions/:id/unmatch`
- `POST /banking/transactions/:id/ignore`
- `POST /banking/transactions/auto-match?bankAccountId&matchWindowDays`
- `POST /banking/reconciliations`                         open a period
- `GET  /banking/reconciliations[/:id]`
- `POST /banking/reconciliations/:id/close`               rejects unless book balance == statement closing balance

---

## 6. Auth & request lifecycle

```
Browser → cookie (access_token) → AuthGuard
   ↓ extracts JWT → re-fetches userRole/companyId/isActive from DB
   ↓ rejects if !isActive
   → req.user = { sub, email, userRole, companyId, ... }
TenantInterceptor (global)
   → assigns/echoes X-Request-Id; reads X-Tenant-Company-Id + X-Show-Deleted (SUPER_ADMIN only)
   → tenantStorage.run({ userId, email, userRole, companyId, superAdminFilterCompanyId, requestId, showDeleted })
   → if SUPER_ADMIN scoped a tenant: writes a `tenant.scope` audit row
PermissionGuard
   → checks @Permissions(…) decorator against req.user.permissions
Controller method runs → calls Service
Service uses PrismaService (proxied → extended client)
   → extension reads tenantStorage: injects WHERE companyId=… + deletedAt:null on every query
   → delete → soft-delete update; create → companyId injected (incl. nested writes)
   → $transaction passes the EXTENDED tx; nested queries are also scoped
   → after a tracked tenant-model write: emits an audit event (→ AuditService → audit_logs)
   → service code may emit domain events via EventBus; listeners re-enter tenant context via runForCompany
```

Cookies set by sign-in:
- `access_token` (httpOnly: false, 15 min). Front-end reads it for `Authorization: Bearer …` header.
- `refresh_token` (httpOnly: true, 15 days). Used by `/auth/refresh-token`. When expired/blacklisted, the frontend axios interceptor force-logs-out the user.

---

## 7. Key files for an integrator to read

| Concern                      | File                                                               |
|------------------------------|--------------------------------------------------------------------|
| Schema                       | `prisma/schema.prisma`                                             |
| Tenant scoping (read this!)  | `src/tenant/*`                                                     |
| Raw SQL helper               | `src/tenant/tenant-query.service.ts`                               |
| Create-payload helper        | `src/tenant/tenant-create.ts`                                      |
| Cron / queue tenant re-entry | `src/tenant/tenant.service.ts` (`forEachCompany` / `runForCompany`)|
| Audit log                    | `src/tenant/audit.service.ts`, `src/tenant/audit-sink.ts`          |
| Event bus                    | `src/events/*`                                                     |
| AuthGuard                    | `src/auth/guard/auth.guard.ts`                                     |
| Token payload                | `src/auth/providers/token.provider.ts`                             |
| User profile shape           | `src/users/users.service.ts` (`profile()`)                         |
| Permission seeding           | `prisma/seed.service.ts`                                           |
| Sales service (template for a new business module) | `src/sales/invoices/invoices.service.ts`     |
| Invoice PDF (template for any new PDF) | `src/sales/invoice-pdf.service.ts`                        |
| Accounting / ledger          | `src/accounting/*`                                                 |
| Bank reconciliation          | `src/banking/*`                                                    |
| CI safety guards             | `scripts/check-*.sh`, `npm run lint:safety`                        |
| Frontend half of this doc    | `../office_archived_frontend/SYSTEM_OVERVIEW.md`                   |

---

## 8. Useful patterns / gotchas

- **Create payloads.** Prisma's generated `<Model>UncheckedCreateInput` requires `companyId`, but the runtime extension injects it (top-level and recursively into known tenant-child nested writes). Use `tenantCreate<Prisma.XUncheckedCreateInput>({...})` (or `tenantCreateStrict<...>` when there are no nested writes). Never `data: {…} as any`.
- **Spread order in the extension** — for non-SUPER_ADMIN creates the extension applies `data = { ...input, companyId }` (system value wins) so a malicious client can't write cross-tenant rows; a mismatch increments the `blockedCrossTenantCreates` counter.
- **`$queryRaw` is NOT extension-aware.** Use `TenantQueryService.queryRaw(column, (TENANT) => Prisma.sql\`…\`)`. `npm run lint:raw-sql` fails the build if you bypass it.
- **AsyncLocalStorage works through await + Observable.** The TenantInterceptor wraps `next.handle()` inside `tenantStorage.run(ctx, () => …)`. Don't break this.
- **Cron jobs / event listeners run without `req.user`.** Wrap their body in `tenants.forEachCompany(...)` or `tenants.runForCompany(id, fn)` so the extension's `effectiveCompanyId()` resolves. `npm run lint:crons` enforces it for `@Cron` methods. Crons must be idempotent.
- **PrismaService is a Proxy**, not a plain `PrismaClient`. Don't clone it or `new PrismaClient()` (banned outside `prisma/seed.{ts,service.ts}` — `npm run lint:prisma-client`). The extension would be lost.
- **Soft delete.** `delete` / `deleteMany` are rewritten to a soft-delete `update`. Reads/updates auto-filter `deletedAt: null`. A SUPER_ADMIN sees soft-deleted rows only with `X-Show-Deleted: 1`; restoring is `update({ where:{id}, data:{ deletedAt: null } })` under that header.
- **Idempotency keys** on stock movements + sales: clients pass `idempotencyKey` for safe retries (unique index on `stock_movements.idempotencyKey`). Ledger postings are idempotent by `(sourceType, sourceId)`.
- **Events are post-commit.** Every `EventBus.emit` is appended to the transaction promise's `.then(...)` so a rolled-back transaction never fires an event.
- **Audit overlap is intentional.** The Prisma extension already audits every tracked write; domain events exist for ledger postings, notifications, future bank reconciliation — not for audit.

---

## 9. Extension example — backend half of "Invoice tracking"

The system already has invoices (= `Sale` records) with `paymentStatus`, `paidAmount`, `remainingAmount`, a `Payment` table, an accounting ledger, and a bank-reconciliation module. For a richer invoice-tracking layer (overdue reminders, recurring invoices, dunning workflow):

1. **New Prisma model** — e.g. `InvoiceReminder { id, saleId Int, sentAt DateTime, channel String, companyId Int, deletedAt DateTime?, … + relations to Sale + Company }`. Add the `invoiceReminders InvoiceReminder[]` back-relation on `Company`.
2. Add `InvoiceReminder` to `TENANT_MODELS` (and `AUDITED_MODELS`) in `src/tenant/tenant-prisma-extension.ts`.
3. `npx prisma migrate dev --name invoice_reminders`.
4. New module `src/invoice-tracking/{module,service,controller,dto}.ts`.
5. Routes under `/invoice-tracking/*` with `@UseGuards(AuthGuard, PermissionGuard) @Permissions('invoice.tracking.read')` etc.
6. Register the module in `app.module.ts`.
7. Add `invoice.tracking.{read,update,…}` permissions to the seed.
8. For PDF dunning letters, add to `src/sales/invoice-pdf.service.ts` (NotoSansArabic font already bundled for RTL).
9. For scheduled reminders, add a `@Cron` method that wraps its body in `tenants.forEachCompany(async (companyId) => { … })`:
   ```ts
   @Cron(CronExpression.EVERY_DAY_AT_8AM)
   async sendOverdueReminders() {
     await this.tenants.forEachCompany(async () => {
       const overdue = await this.prisma.sale.findMany({
         where: { paymentStatus: { in: ['UNPAID','PARTIAL'] }, dueDate: { lt: new Date() } },
       });
       for (const s of overdue) { /* create InvoiceReminder, dispatch, … */ }
     });
   }
   ```
10. Optionally consume the existing `payment.received` event to auto-cancel pending reminders when a customer pays.

The frontend half (config hook, page, sidebar entry) is described in `../office_archived_frontend/SYSTEM_OVERVIEW.md` §6.

---

## 10. Default credentials (dev)

- Super admin: `hakimikamranullah@gmail.com` / `admin`
- Default company: `id=1, name="Default Company", slug="default"`

Re-run `npx prisma db seed` to re-promote the admin to SUPER_ADMIN and re-create roles/permissions.

---

## 11. Running the system

Backend:
```bash
cd office_archived_backend
npm install
npx prisma migrate deploy   # or migrate dev to also generate the client
npx prisma db seed
npm run start:dev           # or :prod
npm run lint:safety         # run the four tenant-safety guards before a PR
```

Frontend:
```bash
cd office_archived_frontend
npm install
npm run dev                 # http://localhost:3001
```

Required env (`.env` in backend):
```
DATABASE_URL="postgresql://postgres:Pgl@123@localhost:5432/archive_db?schema=public"
ACCESS_TOKEN_KEY=...
ACCESS_TOKEN_EXPIRED_TIME=15m
REFRESH_TOKEN_KEY=...
REFRESH_TOKEN_EXPIRED_TIME=15d
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REDIS_HOST=localhost
REDIS_PORT=6379
MINIO_*=...
# optional — notification webhook (§5.3)
ALERT_WEBHOOK_URL=...
ALERT_WEBHOOK_FORMAT=slack          # optional: switch payload to Slack's { text } shape
ALERT_WEBHOOK_BEARER=...            # optional: Authorization: Bearer header
# optional — verbose tenant query logging
TENANT_DEBUG=1
```

---

End of document.
