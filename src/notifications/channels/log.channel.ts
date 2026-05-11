import { Injectable } from "@nestjs/common";
import { TenantLogger } from "../../tenant/tenant-logger";
import { AlertTriggeredPayload } from "../../events/event-types";
import { NotificationChannel } from "../notification-channel";

/**
 * Always-on channel that writes a structured log line per alert. Useful
 * as a sanity-check in dev and as a backstop in prod when external
 * channels are unconfigured. Costs nothing if the alert volume stays
 * reasonable.
 */
@Injectable()
export class LogChannel implements NotificationChannel {
  readonly name = "log";
  private readonly logger = new TenantLogger("NotificationChannel:log");

  isEnabled(): boolean {
    return true;
  }

  async send(payload: AlertTriggeredPayload): Promise<void> {
    this.logger.warn(
      `[NOTIFY:${payload.alertType}] alertId=${payload.alertId} ` +
        `item=${payload.itemId} warehouse=${payload.warehouseId ?? "all"} ` +
        `value=${payload.currentValue} threshold=${payload.threshold}`,
    );
  }
}
