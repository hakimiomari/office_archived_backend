import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { TenantService } from "../tenant/tenant.service";
import { TenantLogger } from "../tenant/tenant-logger";
import { LedgerService } from "./ledger.service";
import {
  EVENTS,
  PaymentReceivedPayload,
  PurchaseReceivedPayload,
  SaleCreatedPayload,
  SupplierPaymentReceivedPayload,
} from "../events/event-types";

/**
 * Posts double-entry journal rows in response to business events from
 * §3.1. Each handler:
 *
 *   1. Re-enters the tenant context via `tenants.runForCompany(...)` —
 *      events fire outside any HTTP request.
 *   2. Calls the appropriate `LedgerService.postXxx` method which
 *      validates balance and inserts the entry + lines atomically.
 *   3. Returns nothing — failures are logged but don't throw, since a
 *      bookkeeping miss shouldn't roll back the source business event.
 *      The audit log + the JE absence are signals for a cleanup job.
 *
 * Idempotency: `LedgerService.post()` short-circuits when an entry
 * already exists for the same `(sourceType, sourceId)`, so event
 * replays are safe.
 */
@Injectable()
export class JournalListener {
  private readonly logger = new TenantLogger(JournalListener.name);

  constructor(
    private readonly tenants: TenantService,
    private readonly ledger: LedgerService,
  ) {}

  @OnEvent(EVENTS.SALE_CREATED)
  async onSaleCreated(payload: SaleCreatedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      try {
        await this.ledger.postSale({
          saleId: payload.saleId,
          invoiceNo: payload.invoiceNo,
          totalAmount: payload.totalAmount,
          paidAmount: payload.paidAmount,
          remainingAmount: payload.remainingAmount,
          saleDate: new Date(),
        });
      } catch (err) {
        this.logger.error(
          `postSale failed for saleId=${payload.saleId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  @OnEvent(EVENTS.PAYMENT_RECEIVED)
  async onPaymentReceived(payload: PaymentReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      try {
        await this.ledger.postPaymentReceived({
          paymentId: payload.paymentId,
          amount: payload.amount,
          paymentDate: new Date(),
        });
      } catch (err) {
        this.logger.error(
          `postPaymentReceived failed for paymentId=${payload.paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  @OnEvent(EVENTS.SUPPLIER_PAYMENT_RECEIVED)
  async onSupplierPaymentReceived(payload: SupplierPaymentReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      try {
        await this.ledger.postSupplierPayment({
          paymentId: payload.paymentId,
          amount: payload.amount,
          paymentDate: new Date(),
        });
      } catch (err) {
        this.logger.error(
          `postSupplierPayment failed for paymentId=${payload.paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  @OnEvent(EVENTS.PURCHASE_RECEIVED)
  async onPurchaseReceived(payload: PurchaseReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      try {
        await this.ledger.postPurchase({
          purchaseId: payload.purchaseId,
          totalAmount: payload.totalAmount,
          paidAmount: payload.paidAmount,
          remainingAmount: payload.remainingAmount,
          purchaseDate: new Date(),
        });
      } catch (err) {
        this.logger.error(
          `postPurchase failed for purchaseId=${payload.purchaseId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }
}
