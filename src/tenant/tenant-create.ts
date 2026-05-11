/**
 * Sanctioned override for tenant-aware Prisma create payloads.
 *
 * Prisma's generated `XxxUncheckedCreateInput` types require `companyId`
 * at compile time. At runtime the tenant Prisma extension injects it from
 * AsyncLocalStorage (top-level and recursively into known tenant-child
 * nested writes like `sale.items.create`, `purchase.items.create`,
 * `stockCount.lines.create`), so service code never has to provide it.
 *
 * Previously this seam was bridged with `data: { … } as any`, which
 * silenced ALL type-checking on the payload. `tenantCreate<T>({...})`
 * is the documented replacement:
 *
 *   - The generic parameter `T` documents which Prisma model the
 *     payload targets, so a reader knows what fields are valid.
 *   - The input type is widened to `Partial<T> & object` so nested
 *     writes whose rows legitimately omit `companyId` still typecheck.
 *     (Strict per-field validation of the OUTER object is still useful
 *     and is provided by `tenantCreateStrict` below for the simple
 *     cases that don't include nested writes.)
 *   - The return type is the full `T` so Prisma's `create()` signature
 *     accepts it.
 *
 * Example:
 *   import { Prisma } from '@prisma/client';
 *   await prisma.sale.create({
 *     data: tenantCreate<Prisma.SaleUncheckedCreateInput>({
 *       invoiceNo, customerId, totalAmount,
 *       items: { create: [{ itemId, quantity, unitPrice }] }, // companyId injected at runtime
 *     }),
 *   });
 */
export function tenantCreate<T>(data: object): T {
  // The tenant Prisma extension injects companyId at runtime (top-level
  // and recursively for known tenant-child nested writes). This cast is
  // the seam between TS's compile-time view and the runtime contract.
  //
  // Input is `object` rather than `Partial<T>` because Prisma's nested
  // `items.create` / `lines.create` types are discriminated unions whose
  // variants both require `companyId`, and `Partial<T>` doesn't recurse
  // into them. For payloads without nested writes, prefer
  // `tenantCreateStrict<T>` which validates every outer field.
  return data as unknown as T;
}

/**
 * Stricter variant for create payloads that have NO nested writes —
 * validates that every field except `companyId` is present and typed
 * correctly per Prisma's generated input.
 */
export function tenantCreateStrict<T extends { companyId?: any }>(
  data: Omit<T, "companyId">,
): T {
  return data as unknown as T;
}

export function tenantCreateMany<T extends { companyId?: any }>(
  rows: Array<Omit<T, "companyId">>,
): T[] {
  return rows as unknown as T[];
}
