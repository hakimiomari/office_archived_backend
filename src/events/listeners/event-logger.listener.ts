import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { TenantService } from "../../tenant/tenant.service";
import { TenantLogger } from "../../tenant/tenant-logger";
import {
  AlertTriggeredPayload,
  EVENTS,
  PaymentReceivedPayload,
  PurchaseReceivedPayload,
  SaleCancelledPayload,
  SaleCreatedPayload,
  StockMovedPayload,
  SupplierPaymentReceivedPayload,
} from "../event-types";

/**
 * Demonstration listener: subscribes to every domain event and logs it
 * inside the originating tenant's context. Two things to notice:
 *
 *  1. Each handler wraps its body in `tenants.runForCompany(...)`. Events
 *     fire outside an HTTP request, so the tenant interceptor never ran
 *     for this code path. Without the wrapper a follow-up Prisma query
 *     would be unscoped.
 *  2. Logging uses `TenantLogger` so each line carries the
 *     `[req:<id>][company:<id>]` prefix from §1.4, making it easy to
 *     trace back to the request that emitted the event.
 *
 * Real listeners (notification dispatch, future analytics) follow the
 * same shape but do more than log.
 */
@Injectable()
export class EventLoggerListener {
  private readonly logger = new TenantLogger(EventLoggerListener.name);

  constructor(private readonly tenants: TenantService) {}

  @OnEvent(EVENTS.SALE_CREATED)
  async onSaleCreated(payload: SaleCreatedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `sale.created saleId=${payload.saleId} invoice=${payload.invoiceNo} total=${payload.totalAmount}`,
      );
    });
  }

  @OnEvent(EVENTS.SALE_CANCELLED)
  async onSaleCancelled(payload: SaleCancelledPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `sale.cancelled saleId=${payload.saleId} invoice=${payload.invoiceNo} remaining=${payload.remainingAmount}`,
      );
    });
  }

  @OnEvent(EVENTS.PAYMENT_RECEIVED)
  async onPaymentReceived(payload: PaymentReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `payment.received paymentId=${payload.paymentId} saleId=${payload.saleId} amount=${payload.amount}`,
      );
    });
  }

  @OnEvent(EVENTS.SUPPLIER_PAYMENT_RECEIVED)
  async onSupplierPaymentReceived(payload: SupplierPaymentReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `supplier_payment.received paymentId=${payload.paymentId} supplierId=${payload.supplierId} amount=${payload.amount}`,
      );
    });
  }

  @OnEvent(EVENTS.STOCK_MOVED)
  async onStockMoved(payload: StockMovedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `stock.moved movementId=${payload.movementId} item=${payload.itemId} type=${payload.type} qty=${payload.quantity}`,
      );
    });
  }

  @OnEvent(EVENTS.ALERT_TRIGGERED)
  async onAlertTriggered(payload: AlertTriggeredPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `alert.triggered alertId=${payload.alertId} type=${payload.alertType} item=${payload.itemId} current=${payload.currentValue} threshold=${payload.threshold}`,
      );
    });
  }

  @OnEvent(EVENTS.PURCHASE_RECEIVED)
  async onPurchaseReceived(payload: PurchaseReceivedPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      this.logger.debug(
        `purchase.received purchaseId=${payload.purchaseId} supplier=${payload.supplierId} total=${payload.totalAmount}`,
      );
    });
  }
}
