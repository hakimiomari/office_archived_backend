import { Injectable, Logger } from "@nestjs/common";
import { AlertTriggeredPayload } from "../../events/event-types";
import { NotificationChannel } from "../notification-channel";

/**
 * Generic webhook channel. POSTs a small JSON payload to the URL in
 * `ALERT_WEBHOOK_URL` (env). Disabled when the env var is absent so
 * dev runs don't accidentally fire requests.
 *
 * The payload shape is intentionally generic so the same URL works for
 * Slack incoming webhooks, Pagerduty events API, Discord webhooks,
 * Microsoft Teams, or anything that accepts a JSON `text`/`message`
 * field. For Slack-specific formatting, set `ALERT_WEBHOOK_FORMAT=slack`
 * to switch to Slack's `{ text: "..." }` shape.
 *
 * Auth-required webhooks: set `ALERT_WEBHOOK_BEARER` to send an
 * `Authorization: Bearer <token>` header.
 */
@Injectable()
export class WebhookChannel implements NotificationChannel {
  readonly name = "webhook";
  private readonly logger = new Logger("NotificationChannel:webhook");
  private readonly url = process.env.ALERT_WEBHOOK_URL;
  private readonly bearer = process.env.ALERT_WEBHOOK_BEARER;
  private readonly format = process.env.ALERT_WEBHOOK_FORMAT;

  isEnabled(): boolean {
    return Boolean(this.url && this.url.length > 0);
  }

  async send(payload: AlertTriggeredPayload): Promise<void> {
    if (!this.url) return;

    const summary =
      `[${payload.alertType}] alertId=${payload.alertId} ` +
      `companyId=${payload.companyId} itemId=${payload.itemId} ` +
      `value=${payload.currentValue} threshold=${payload.threshold}`;

    const body =
      this.format === "slack"
        ? { text: summary }
        : {
            event: "alert.triggered",
            summary,
            ...payload,
          };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.warn(
          `webhook POST ${this.url} → ${res.status}: ${text.slice(0, 200)}`,
        );
      }
    } catch (err) {
      // Don't bubble; the dispatcher fans out and we don't want one
      // bad URL to block other channels.
      this.logger.warn(
        `webhook POST ${this.url} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
