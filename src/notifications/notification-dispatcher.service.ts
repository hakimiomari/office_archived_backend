import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { TenantLogger } from "../tenant/tenant-logger";
import { TenantService } from "../tenant/tenant.service";
import { AuditService } from "../tenant/audit.service";
import {
  AlertTriggeredPayload,
  EVENTS,
} from "../events/event-types";
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "./notification-channel";

/**
 * Fans an `alert.triggered` event out to every enabled channel in
 * parallel. Each channel is responsible for its own retry / backoff —
 * the dispatcher only:
 *  - Re-enters the tenant context (the event fired from a cron).
 *  - Runs the channels concurrently via `Promise.allSettled` so a
 *    failing webhook can't block the log channel.
 *  - Writes one `notification.dispatch` audit row per (channel,
 *    outcome) pair so operators can see what got delivered.
 *
 * Idempotency lives one layer up — `AlertsService.dispatchOpen` only
 * emits for alerts where `dispatchedAt IS NULL`, so re-running the
 * cron doesn't double-notify.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new TenantLogger(NotificationDispatcher.name);

  constructor(
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  @OnEvent(EVENTS.ALERT_TRIGGERED)
  async onAlertTriggered(payload: AlertTriggeredPayload) {
    await this.tenants.runForCompany(payload.companyId, async () => {
      const active = this.channels.filter((c) => c.isEnabled());
      if (active.length === 0) {
        this.logger.debug(
          `no enabled channels; alertId=${payload.alertId} silently skipped`,
        );
        return;
      }
      const results = await Promise.allSettled(
        active.map((c) => c.send(payload)),
      );
      results.forEach((r, idx) => {
        const ch = active[idx];
        if (r.status === "fulfilled") {
          this.audit.log({
            action: "notification.dispatched",
            entity: "Alert",
            entityId: payload.alertId,
            notes: `channel=${ch.name} alertType=${payload.alertType}`,
          });
        } else {
          this.logger.error(
            `channel=${ch.name} alertId=${payload.alertId} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
          );
          this.audit.log({
            action: "notification.failed",
            entity: "Alert",
            entityId: payload.alertId,
            notes: `channel=${ch.name} error=${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
          });
        }
      });
    });
  }
}
