# Architecture Upgrade Status — Backend

> **Backend half** of the status doc. The frontend rows + frontend-specific
> deferred items live in
> [`../office_archived_frontend/STATUS.md`](../office_archived_frontend/STATUS.md).
> Tracks what's shipped, what's deferred, and where to look in the codebase —
> so the next contributor (human or AI) can pick up from a known state.
> See [`ARCHITECTURE_UPGRADE.md`](ARCHITECTURE_UPGRADE.md) for design intent
> and [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) for the data model.

---

## Roadmap status (backend)

| Item | Spec | Status | Where it lives |
|---|---|---|---|
| **1.1** | Cron tenant isolation | ✅ | `src/tenant/tenant.service.ts` — `forEachCompany` / `runForCompany`. `src/alerts/alerts.service.ts` — both crons fan out via `tenants.forEachCompany(...)`. |
| **1.2** | Secure SUPER_ADMIN tenant switch | ✅ | Header `X-Tenant-Company-Id` (server-trusted, SUPER_ADMIN only). `src/tenant/tenant.interceptor.ts`. (Frontend axios sends it — see the frontend STATUS.) |
| **1.3** | Raw SQL tenant safety | ✅ | `src/tenant/tenant-query.service.ts` is the only place `$queryRaw` / `$executeRaw` is allowed. Enforced by `npm run lint:raw-sql`. |
| **1.4** | Tenant debug & logging layer | ✅ | `X-Request-Id` end-to-end correlation. `[req:<id>][company:<id>]` prefix via `src/tenant/tenant-logger.ts`. `TENANT_DEBUG=1` prints final Prisma `where`/`data`. Counters at `GET /admin/debug/tenant-stats`. |
| **2.1** | Split large modules | ✅ | `sales/{customers,invoices,payments,reports}/`, `inventory/{items,warehouses,suppliers,movements,purchasing,reports}/`. Controllers stay as one file each so route paths are stable. |
| **2.2** | Domain layer (DDD-lite) | ⚠️ deferred | See [Deferred items](#deferred-items) below. |
| **2.3** | Remove `as any` Prisma DTO casts | ✅ | `src/tenant/tenant-create.ts` — `tenantCreate<T>` / `tenantCreateStrict<T>`. 47 `as any` → 3 effective (Prisma proxy seam + `$queryRaw` typing). |
| **2.4** | Soft delete | ✅ | `deletedAt DateTime?` on every tenant model. Extension auto-filters reads/updates; `delete` is rewritten to `update({ data: { deletedAt: now } })`. SUPER_ADMIN opt-in via `X-Show-Deleted: 1`. |
| **3.1** | Event-driven architecture | ✅ | `src/events/` — typed `EventBus.emit<E>(name, payload)`. Producers: sales, payments, purchasing, movements, alerts. Demo listener at `src/events/listeners/event-logger.listener.ts`. |
| **3.2** | Audit log | ✅ | `audit_logs` table. Prisma extension auto-writes for tracked tenant-model writes (`src/tenant/tenant-prisma-extension.ts`). Service events via `AuditService.log` (`src/tenant/audit.service.ts`). Query at `GET /admin/audit-logs`. |
| **3.3** | Composite indexes | ✅ | 12 composite indexes on Sale / StockMovement / Payment / Purchase / InventoryStock / Item / Customer. All lead with `companyId`. Migration `…_composite_indexes`. |
| **3.4** | Cron architecture rules | ✅ | Documented in `tenant.service.ts` JSDoc. Enforced by `npm run lint:crons`. Opt-out marker: `// cron:cross-tenant-ok`. |
| **5.1** | Accounting layer | ✅ (v1) | `src/accounting/` — Account / JournalEntry / JournalLine. Posting rules via `JournalListener`. Default chart auto-seeded on Company create. Endpoints under `/accounting/*`. |
| **5.2** | Bank reconciliation | ✅ (JSON import) | `src/banking/` — BankAccount / BankTransaction / Reconciliation. Auto-match by amount + ±2-day window. Endpoints under `/banking/*`. |
| **5.3** | Full event-driven ERP core | ✅ | Ledger poster (§5.1) + audit logger (§3.2) + notification dispatcher (`src/notifications/`) all subscribe to events. Queue-based inventory deferred. |
| **5.4** | Multi-tenant safety hardening | ✅ | Four CI guards aggregated as `npm run lint:safety`. |

Frontend items (§4.1–§4.4) and their status are in `../office_archived_frontend/STATUS.md`.

---

## Safety guarantees (run before every PR merge)

```bash
cd office_archived_backend
npm run lint:safety   # runs all four guards below

# Or individually:
npm run lint:raw-sql        # bans $queryRaw / $executeRaw outside src/tenant/
npm run lint:crons          # @Cron methods must fan out via TenantService.forEachCompany
npm run lint:tenant-models  # every Prisma model must be classified (tenant or non-tenant)
npm run lint:prisma-client  # new PrismaClient() only allowed in prisma/seed.{ts,service.ts}
```

What each one catches:

- **`lint:raw-sql`** — someone writes `prisma.$queryRaw` somewhere and forgets the `${TENANT_FILTER}` clause. Result: cross-tenant data leak. The guard forces raw SQL through `TenantQueryService` where the tenant filter is mandatory.
- **`lint:crons`** — someone adds an `@Cron()` method that calls `this.prisma.x.findMany()` directly. Result: the query sees rows from every tenant. The guard requires the method's file to call `forEachCompany(...)` / `runForCompany(...)`.
- **`lint:tenant-models`** — someone adds a new Prisma model and forgets to register it in `TENANT_MODELS`. Result: extension passes through, cross-tenant leak. The guard requires every schema model to be classified as tenant or explicit non-tenant.
- **`lint:prisma-client`** — someone constructs `new PrismaClient()` to "just grab a fresh client." Result: the tenant extension doesn't apply. The guard restricts construction to seed files.

---

## Deferred items (backend)

Each entry has a "revisit when" trigger so it's clear what changes the calculus.

### §2.2 — Domain layer (DDD-lite)

**Why deferred.** The architecture doc proposes `Controller → Service → DomainService → Repository` with the DomainService enforcing invariants. At current complexity (one balance-check in §5.1's `LedgerService`, basic FIFO/atomic primitives in `InventoryCoreService`), there isn't enough cross-cutting business logic to justify an indirection layer.

**Revisit when.** Accounting acquires period-close enforcement, balance-sheet adjustments, and tax handling — that's when "every Sale must produce balanced postings" stops being a single function and becomes a body of rules. The accounting `LedgerService` is the seed; promote it into a proper `AccountingDomainService` when the second or third invariant lands.

### §5.3 — Queue-based inventory side-effects

**Why deferred.** Today, `InvoicesService.create` runs inside a single Prisma `$transaction` that posts the sale row + decrements stock + consumes FIFO batches + posts the OUT stock movement all atomically. That's the **correct** model for small-to-mid tenants — failures roll back cleanly, and concurrency is bounded by the atomic decrement.

Switching to async (event-driven inventory) means introducing a queue infra (BullMQ + Redis worker process), separate deployment, retry semantics, dead-letter queue, and idempotency keys carried through queue messages. None of that is currently needed.

**Revisit when.** A single tenant generates enough sale volume that the inline transaction becomes a contention bottleneck — typically when peak sale create rate exceeds ~100/sec, or when the inventory decrement happens against a stock row that's also being updated by other concurrent operations causing serialization-retry storms. The signal is `SerializationError` rate going up on the sales endpoint. Until then, inline is faster and simpler.

When you do flip it, the natural shape is:
1. `InvoicesService.create` still runs the transaction that books the sale.
2. After commit, the `sale.created` event fires (already wired in §3.1).
3. A new `InventoryStockOutListener` consumes the event and queues a job per sale line.
4. The job worker performs the same atomic decrement + FIFO + stock movement logic, with the sale-line `idempotencyKey` already in place to make retries safe.

The seam is ready; the queue just needs to be plugged in.

### §5.1 / §5.2 known v1 gaps

- **No COGS posting** — sales book gross revenue; Inventory/COGS lines need either per-line cost on the `sale.created` payload or a `stock.moved` listener that posts inventory/COGS for OUT movements.
- **No tax / discount split** in journal entries.
- **No period-close enforcement** — `JournalEntry.isLocked` exists but nothing yet refuses updates on locked entries; same for reconciliation periods.
- **No CSV/OFX bank-statement import** — `POST /banking/transactions/import` takes JSON.
- **Existing tenants need `POST /accounting/seed-all`** once to backfill the chart of accounts. New companies get it automatically on create.

---

## Quick reference for a new backend contributor

1. **Start with** [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) for the data model, conventions, and existing patterns.
2. **Then read** [`ARCHITECTURE_UPGRADE.md`](ARCHITECTURE_UPGRADE.md) for the design intent.
3. **Then this file** for the current state.
4. **Run** `npm run lint:safety` before opening any PR.
5. **Add a new business model?** Add `companyId` + `deletedAt` to the schema, add the model name to `TENANT_MODELS` in `src/tenant/tenant-prisma-extension.ts` the same commit, add the back-relation on `Company`. `lint:tenant-models` will catch the omission. Migrate with `npx prisma migrate dev`.
6. **Add a new cron?** Wrap its body in `tenants.forEachCompany(async (companyId) => { … })`. Make it idempotent. `lint:crons` will catch the omission.
7. **Add raw SQL?** Use `TenantQueryService.queryRaw(column, (TENANT) => Prisma.sql\`… WHERE ${TENANT} …\`)`. `lint:raw-sql` will catch the omission.
8. **Create a row?** Use `tenantCreate<Prisma.XUncheckedCreateInput>({...})` (or `tenantCreateStrict<...>` if no nested writes). Never `data: {…} as any`.
9. **Need a background side-effect?** Emit a domain event via `EventBus` and add a listener that re-enters the tenant context with `tenants.runForCompany(payload.companyId, fn)`.

---

End of document.
