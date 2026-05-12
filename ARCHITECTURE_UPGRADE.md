# Architecture Improvement & Upgrade Blueprint — Backend

> **Backend half** of the upgrade blueprint. The frontend improvements
> (§4) live in
> [`../office_archived_frontend/ARCHITECTURE_UPGRADE.md`](../office_archived_frontend/ARCHITECTURE_UPGRADE.md).
> Cross-cutting sections (final vision, priority roadmap, AI-integration
> notes) are duplicated into both halves. For what's actually shipped vs.
> deferred, see [`STATUS.md`](STATUS.md) in this directory. For the data
> model and conventions, see [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md).

---

## 1. 🔴 Critical Fixes (Must Do)

### 1.1 Fix Cron Job Tenant Isolation (HIGH RISK)

**Problem.** Cron jobs (`AlertsService.hourly`, `AlertsService.dailyDeadStock`)
run without `req.user`, so the `TenantInterceptor` doesn't populate
`tenantStorage`. The Prisma extension's `effectiveCompanyId()` then returns
`null`, and queries pass through unfiltered.

**Fix.**
1. Add a `TenantService.forEachCompany(fn)` helper that iterates active
   companies and runs `fn(company)` inside `tenantStorage.run({ companyId, … })`.
2. Refactor every `@Cron()` method to call this helper instead of running
   global queries.
3. Forbid bare `prisma.<model>.findMany()` in cron jobs via a lint rule.

```ts
// src/tenant/tenant.service.ts (new)
async forEachCompany<T>(
  fn: (companyId: number) => Promise<T>,
): Promise<T[]> {
  const companies = await this.prisma.company.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const out: T[] = [];
  for (const { id } of companies) {
    const ctx: TenantContextData = {
      userId: 0, email: 'system-cron', userRole: 'SUPER_ADMIN',
      companyId: null, superAdminFilterCompanyId: id,
    };
    out.push(await tenantStorage.run(ctx, () => fn(id)));
  }
  return out;
}
```

**Rule.** No cron job may run unscoped Prisma queries.

---

### 1.2 Secure SUPER_ADMIN Tenant Switching

**Problem.** SUPER_ADMINs can pass `?companyId=N` on any request to scope
their view — visible in logs / browser history, easy to copy-paste between
tabs, and a frontend-manipulation risk.

**Fix.**
1. Move the impersonation signal from `?companyId=N` query param to an
   `X-Tenant-Company-Id` header.
2. `TenantInterceptor` reads the header *only* when `req.user.userRole === 'SUPER_ADMIN'`.
3. Emit an audit-log entry (see §3.2) every time a SUPER_ADMIN changes
   tenant scope (`superAdminUserId`, `enteredCompanyId`, `requestPath`).
4. Frontend `axios` interceptor sets the header (not the query param) when
   `filterCompanyId` is non-null in `TenantFilterContext`.

**Rule.** Tenant scoping is a server-trusted decision; the client only signals.

---

### 1.3 Raw SQL Tenant Safety (CRITICAL)

**Problem.** Prisma extensions don't run on `$queryRaw` / `$executeRaw`.
"Remember to add `${tenantSqlFilter(…)}` in the WHERE clause" degrades as
more devs touch the code.

**Fix.**
1. Wrap raw queries in a `TenantQueryService` that *requires* a column
   argument and gives the SQL builder a mandatory `${TENANT_FILTER}`:
   ```ts
   tenantQuery.queryRaw<{ x: number }[]>('"i"."companyId"', (TENANT) => Prisma.sql`
     SELECT i.x FROM items i WHERE ${TENANT}
   `);
   ```
2. Add a CI grep check that fails the build if `prisma.$queryRaw` /
   `prisma.$executeRaw` is used outside this service.

**Rule.** Any raw SQL without an explicit tenant filter is invalid by design.

---

### 1.4 Add Tenant Debug & Logging Layer

- A request-scoped logger that prefixes every line with `[req:<id>][company:<id>]`.
- An optional Prisma query log in dev (`TENANT_DEBUG=1`) that prints the final
  `where`/`data` Prisma sent (post-extension).
- Counters for "cross-tenant write attempt blocked".

This cuts ERP-grade triage time dramatically.

---

## 2. 🟠 Architecture Improvements (High Impact)

### 2.1 Split Large Modules (Sales & Inventory)

The `sales/` and `inventory/` services were getting god-class-y (~900 lines
each). Split by sub-aggregate:

**Sales** → `customers/`, `invoices/` (the `Sale` aggregate), `payments/`, `reports/`. Keep one controller so route paths stay stable.

**Inventory** → `items/`, `warehouses/`, `suppliers/`, `movements/`, `purchasing/`, `reports/`, plus the already-split `core` (InventoryCoreService), `alerts`, `stock-counts`.

**Benefits.** Smaller services, clearer ownership, easier to add features without cracking open a 900-line file.

---

### 2.2 Introduce Domain Layer (DDD-lite)

**Current.** `Controller → Service → Prisma`. Services do both business
rules *and* persistence.

**Recommended.** `Controller → Service → DomainService → Repository`.
- `Repository` = thin Prisma wrapper, returns rich domain objects (or DTOs).
- `DomainService` = enforces invariants ("a sale's `paidAmount` cannot
  exceed `totalAmount`," "FIFO consumption must match `OUT.quantity`,"
  "double-entry must balance").
- `Service` = orchestration + transactions.

**Why.** Once an accounting module exists (§5.1), invariants multiply
(debits = credits, journal entries immutable, period-close locking).
Without a domain layer they get scattered across controllers, services, and
request handlers.

---

### 2.3 Remove `as any` Prisma DTO Pattern

**Problem.** `data: { ... } as any` because the generated Prisma types
require `companyId` but the runtime extension injects it.

**Fix.**
1. **Don't include `companyId` in DTOs** — the extension already injects the trusted value.
2. Introduce `tenantCreate<Prisma.XUncheckedCreateInput>({...})` / `tenantCreateStrict<...>` helpers in `src/tenant/tenant-create.ts`. The generic parameter documents the model; the strict variant validates every outer field for payloads without nested writes.

**Result.** Cleaner type signatures, no possibility of a DTO bypassing the extension.

---

### 2.4 Introduce Soft Delete Standardization

ERP rule: financial data is rarely hard-deleted.
1. Every tenant model gets `deletedAt DateTime?`.
2. The Prisma extension filters `deletedAt: null` automatically (parallel to the `companyId` filter); `delete` / `deleteMany` are rewritten to a soft-delete `update`.
3. A "show deleted" toggle for SUPER_ADMINs only (`X-Show-Deleted: 1`) so a tenant's own admin can't undo a delete the system marked as such.
4. Hard-delete (`purge()`) is opt-in via a separate service call / raw SQL.

**Benefit.** Recoverable mistakes, audit-trail integrity, simpler GDPR compliance later.

---

## 3. 🟡 Scalability Improvements

### 3.1 Event-Driven Architecture (HIGH VALUE UPGRADE)

A typed event bus (`@nestjs/event-emitter`):

| Event | Producer | Typical consumers |
|---|---|---|
| `sale.created` | `InvoicesService.create` | Inventory (stock OUT inline), audit log, AR posting |
| `sale.cancelled` | `InvoicesService.cancel` | Reverse-AR, inventory IN |
| `stock.moved` | `MovementsService` | Audit log, reorder check |
| `payment.received` / `supplier_payment.received` | `PaymentsService.create` / `PurchasingService.createSupplierPayment` | AR/AP updates, audit log, bank reconciliation |
| `alert.triggered` | `AlertsService.dispatchOpen` | Notification dispatch (log / webhook / Slack) |
| `purchase.received` | `PurchasingService.create`/`receive` | AP posting, batch creation, audit log |

**Benefits.** Decouples write paths from secondary effects; lets future
ledger postings happen without touching `InvoicesService`; makes async /
queue processing trivial later.

**Tenant safety on events.** The payload includes `companyId`; the listener
re-enters `tenants.runForCompany(companyId, fn)` so its DB calls are scoped
— it has no `req.user`. Emits are **post-commit** (appended to the
transaction promise's `.then(...)`), so a rolled-back transaction fires
nothing.

---

### 3.2 Audit Log System (ERP ESSENTIAL)

Add a global table:

```prisma
model AuditLog {
  id         Int      @id @default(autoincrement())
  companyId  Int?     // null for cross-tenant SUPER_ADMIN actions
  userId     Int?     // null for cron-driven changes
  email      String?
  action     String   // e.g. "sale.create", "stock.adjustment", "tenant.scope", "auth.login"
  entity     String?  // e.g. "Sale", "InventoryStock"
  entityId   Int?
  before     Json?
  after      Json?
  ipAddress  String?
  userAgent  String?
  requestId  String?  // correlates with the request log
  notes      String?
  createdAt  DateTime @default(now())

  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([entity, entityId])
  @@index([userId])
  @@index([action])
  @@map("audit_logs")
}
```

Hook it via:
- A Prisma `$extends` hook that emits an audit event after every tracked
  tenant-model write (the audit sink → `AuditService` → `audit_logs`).
- Direct `AuditService.log(...)` calls for non-CRUD events (logins, tenant
  switches, notification dispatch).

**Tracks.** Every financial change, stock change, user action, login,
SUPER_ADMIN tenant switch, notification dispatch. Filterable by user /
entity / date via `GET /admin/audit-logs`.

---

### 3.3 Database Index Optimization

Add composite indexes for the queries the app actually runs (every one
leads with `companyId` since the extension filters on it):

- **Sales**: `(companyId, saleDate)`, `(companyId, paymentStatus, dueDate)`, `(companyId, customerId, saleDate)`, `(companyId, saleStatus, saleDate)`
- **StockMovement**: `(companyId, type, createdAt)`, `(companyId, itemId, createdAt)`, `(companyId, referenceType, referenceId)`
- **Payment**: `(companyId, paymentDate)`
- **Purchase**: `(companyId, status, purchaseDate)`
- **InventoryStock**: `(companyId, itemId)`
- **Item / Customer**: `(companyId, name)`

Run `EXPLAIN ANALYZE` on the slowest reports first; only add what's needed.

---

### 3.4 Improve Cron Architecture

Hard rules:
1. Every `@Cron` method calls `tenants.forEachCompany(async (companyId) => {…})`.
2. Inside the iteration, all Prisma calls flow through the extended client and are auto-scoped. No global state.
3. Crons must be idempotent — running the same hour twice produces the same result.

Enforced by a CI guard (`npm run lint:crons`); files doing genuinely
cross-tenant maintenance opt out with the marker `// cron:cross-tenant-ok`.

---

## 5. 🧠 Strategic ERP Evolution

The system is ERP-grade for inventory + light sales. The next steps push it
toward a full SaaS ERP.

### 5.1 Accounting Layer (BIG UPGRADE)

Move from "remainingAmount fields on each row" to a proper general ledger:

```prisma
model Account     { id, companyId, code, name, type (ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE), parentId?, isActive, notes, … }
model JournalEntry { id, companyId, entryNo, date, description, sourceType?, sourceId?, isLocked, lockedAt, createdBy, … }
model JournalLine  { id, journalEntryId, accountId, companyId, debit, credit, description? }
```

Rules:
- Every business event (sale, purchase, payment) emits a `JournalEntry`
  whose lines balance (Σ debits = Σ credits).
- Default chart of accounts auto-seeded per company; posting rules look up
  accounts by stable codes (1000 Cash, 1200 AR, 1300 Inventory, 2000 AP,
  4000 Sales Revenue, 5000 COGS, …).
- Posting is idempotent by `(sourceType, sourceId)` so event replays don't double-post.
- Reports: `SELECT sum(credit) - sum(debit) FROM journal_lines WHERE account_id = …`.
- Period-close: lock journals before a date; require an override to edit.

The events from §3.1 are the natural posting hook (`JournalListener`
subscribes to `sale.created` / `payment.received` / `supplier_payment.received`
/ `purchase.received`).

**v1 caveats.** No COGS posting yet (sales book gross revenue), no
tax/discount split, no period-close enforcement.

---

### 5.2 Payment & Bank Reconciliation Module

```prisma
model BankAccount     { id, companyId, name, accountNumber?, currency, provider?, openingBalance, isActive, … }
model BankTransaction { id, companyId, bankAccountId, statementDate, direction (CREDIT|DEBIT), amount, description?, reference?, raw (Json?), status (UNMATCHED|MATCHED|IGNORED), matchedPaymentId?, matchedSupplierPaymentId?, matchedAt?, matchedBy?, … }
model Reconciliation  { id, companyId, bankAccountId, periodStart, periodEnd, status (OPEN|COMPLETED), openingBalance, closingBalance, createdBy?, completedAt?, … }
```

Workflow:
1. Import bank statement → creates `BankTransaction` rows (v1: JSON import; CSV/OFX is follow-up).
2. Auto-match against `Payment` (CREDIT) and `SupplierPayment` (DEBIT) by exact amount + ±N-day window (default 2), tie-broken by `reference` equality; ambiguous rows left UNMATCHED.
3. Manual matcher for unmatched / ignored entries.
4. `close()` the reconciliation period — rejected unless the book balance (`openingBalance` + Σ matched/ignored CREDIT − DEBIT) equals the statement closing balance.

Reconciliation does **not** create journal entries — Payments and
SupplierPayments are already posted by §5.1; the bank-tx ↔ payment link is
metadata confirming the money actually moved.

---

### 5.3 Full Event-Driven ERP Core

Convert every domain action into an event (see §3.1). Listeners:
- Ledger poster — creates `JournalEntry` from sale/payment/purchase events (§5.1). ✅
- Audit logger — writes `AuditLog` from any tracked tenant-model write (§3.2). ✅
- Notification dispatcher — `alert.triggered` → log / webhook / Slack channels, fanned out with `Promise.allSettled`; `Alert.dispatchedAt` makes dispatch idempotent across cron runs. ✅
- Inventory side-effects — sale → stock OUT; today inline (correct at small-to-mid scale), future async via queue for high-volume tenants. (Deferred — see `STATUS.md`.)

---

### 5.4 Multi-tenant Safety Hardening

Combine §1 and §3.2 into a permanent guarantee, enforced by four CI guards
(aggregated as `npm run lint:safety`):
1. **Cron isolation layer** (§1.1) — `lint:crons`.
2. **Audit log** for every write (§3.2) — Prisma extension hook + `AuditService`.
3. **Tenant query validator** — `lint:tenant-models`: every Prisma model in the schema must be classified, either in `TENANT_MODELS` (auto-scoped) or in the explicit non-tenant allowlist.
4. **Strict Prisma wrapper rules** — `lint:prisma-client`: `new PrismaClient()` only allowed in `prisma/seed.{ts,service.ts}`; all other DB access goes through `PrismaService`. Plus `lint:raw-sql`: no `$queryRaw` / `$executeRaw` outside `src/tenant/`.

---

## 6. 🧩 Final Architecture Vision

If the upgrades above are applied, the system becomes:

- ✅ Multi-tenant SaaS ERP with airtight data isolation.
- ✅ Financial-grade accounting with double-entry ledger + reconciliation.
- ✅ Event-driven, scalable backend ready to extract microservices.
- ✅ Audit-compliant — every change is logged with before/after JSON.
- ✅ Enterprise-ready NestJS monolith — splittable but not requiring it.

---

## 7. 📌 Priority Roadmap

| Phase | Items | Where |
|---|---|---|
| **Phase 1 — Safety** | Cron isolation (`TenantService.forEachCompany`); SUPER_ADMIN tenant switch → `X-Tenant-Company-Id` header; wrap raw SQL in `TenantQueryService` + CI check; request-scoped `[company:<id>]` logger | Backend |
| **Phase 2 — Structure** | Split `sales/` + `inventory/`; (DomainService + Repository — deferred); replace `as any` with `tenantCreate<T>`; `deletedAt` soft-delete + extension hook | Backend |
| **Phase 3 — Scalability** | `AuditLog` model + auto-write hook; event bus + listeners; composite indexes; cron hard rules; (React Query in frontend `api/hooks/` — see frontend doc §4) | Backend (+ frontend) |
| **Phase 4 — Frontend** | API layer restructure; (optimistic UI — deferred); table perf (debounce); role-based sidebar perf (Set-based permissions) | Frontend (see `../office_archived_frontend/ARCHITECTURE_UPGRADE.md`) |
| **Phase 5 — ERP Evolution** | Accounting module (`Account` / `JournalEntry` / `JournalLine`); posting rules via the event bus; (period-close locking — partial); bank-reconciliation module; (full financial reporting engine — follow-up) | Backend |

See [`STATUS.md`](STATUS.md) for the per-item shipped/deferred state.

---

## 8. Implementation reference for an integrating AI

When asking ChatGPT (or another agent) to apply any of the above:

1. Always pass [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) (backend) **first** so the agent knows the existing conventions. For frontend work, also pass `../office_archived_frontend/SYSTEM_OVERVIEW.md`.
2. Then point at the specific phase + section here, e.g.: *"Implement §1.1 cron-isolation. Use the `TenantService.forEachCompany` pattern. Update `AlertsService.hourly` / `dailyDeadStock`. Add a migration if needed."*
3. After each task, run `npx tsc --noEmit` (backend) / `npx tsc --noEmit -p tsconfig.json` (frontend), `npx prisma migrate dev` if the schema changed, and `npm run lint:safety` (backend) before considering it done.

---

End of document.
