/**
 * Typed domain events emitted by service code.
 *
 * Conventions:
 *  - Every payload carries `companyId` so listeners can re-enter the tenant
 *    context via `TenantService.runForCompany(companyId, () => …)` before
 *    touching Prisma. Listeners run outside an HTTP request, so without
 *    that step their queries would be unscoped.
 *  - Event names are dot-separated `<domain>.<verb>` strings. Use the
 *    constants in `EVENTS` rather than inline string literals so refactors
 *    are mechanical.
 *  - Add new events here first; update the corresponding `PayloadByEvent`
 *    entry so listeners get typed payloads through `OnEvent(…)`.
 *
 * Most listeners today are stubs (audit logs are already covered by the
 * Prisma extension in §3.2). The producer-side emits exist so future
 * consumers — accounting ledger postings (§5.1), bank reconciliation
 * (§5.2), notification dispatch (email/Slack/webhook) — can be added
 * without touching the write paths in `InvoicesService`, `PaymentsService`,
 * etc.
 */

export const EVENTS = {
  SALE_CREATED: "sale.created",
  SALE_CANCELLED: "sale.cancelled",
  PAYMENT_RECEIVED: "payment.received",
  SUPPLIER_PAYMENT_RECEIVED: "supplier_payment.received",
  STOCK_MOVED: "stock.moved",
  ALERT_TRIGGERED: "alert.triggered",
  PURCHASE_RECEIVED: "purchase.received",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

interface BaseEventPayload {
  /** Tenant the event belongs to. Required for listener tenant re-entry. */
  companyId: number;
  /** Optional correlation id from the originating request (§1.4). */
  requestId?: string | null;
  /** User who triggered the action, when known. */
  userId?: number | null;
}

export interface SaleCreatedPayload extends BaseEventPayload {
  saleId: number;
  invoiceNo: string;
  customerId: number | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface SaleCancelledPayload extends BaseEventPayload {
  saleId: number;
  invoiceNo: string;
  customerId: number | null;
  remainingAmount: number;
}

export interface PaymentReceivedPayload extends BaseEventPayload {
  paymentId: number;
  saleId: number;
  customerId: number | null;
  amount: number;
}

export interface SupplierPaymentReceivedPayload extends BaseEventPayload {
  paymentId: number;
  supplierId: number;
  purchaseId: number | null;
  amount: number;
}

export interface StockMovedPayload extends BaseEventPayload {
  movementId: number;
  itemId: number;
  type: "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";
  quantity: number;
  sourceWarehouseId: number | null;
  targetWarehouseId: number | null;
  referenceType: string | null;
  referenceId: number | null;
}

export interface AlertTriggeredPayload extends BaseEventPayload {
  alertId: number;
  alertType: "LOW_STOCK" | "OVERSTOCK" | "DEAD_STOCK" | "REORDER";
  itemId: number;
  warehouseId: number | null;
  currentValue: number | null;
  threshold: number | null;
}

export interface PurchaseReceivedPayload extends BaseEventPayload {
  purchaseId: number;
  supplierId: number | null;
  totalAmount: number;
  /** Cash paid at receive time. Drives the Cash vs AP split in the
   *  accounting listener. */
  paidAmount: number;
  /** Outstanding supplier liability. `totalAmount = paidAmount + remainingAmount`. */
  remainingAmount: number;
  targetWarehouseId: number;
}

/**
 * Map every event name to its strongly-typed payload. The `EventBus.emit`
 * wrapper uses this to typecheck the second argument at the call site.
 */
export type PayloadByEvent = {
  [EVENTS.SALE_CREATED]: SaleCreatedPayload;
  [EVENTS.SALE_CANCELLED]: SaleCancelledPayload;
  [EVENTS.PAYMENT_RECEIVED]: PaymentReceivedPayload;
  [EVENTS.SUPPLIER_PAYMENT_RECEIVED]: SupplierPaymentReceivedPayload;
  [EVENTS.STOCK_MOVED]: StockMovedPayload;
  [EVENTS.ALERT_TRIGGERED]: AlertTriggeredPayload;
  [EVENTS.PURCHASE_RECEIVED]: PurchaseReceivedPayload;
};
