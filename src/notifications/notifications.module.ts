import { Module } from "@nestjs/common";
import { LogChannel } from "./channels/log.channel";
import { WebhookChannel } from "./channels/webhook.channel";
import { NotificationDispatcher } from "./notification-dispatcher.service";
import { NOTIFICATION_CHANNELS } from "./notification-channel";

/**
 * Notifications module (§5.3 — full event-driven core).
 *
 * Subscribes to `alert.triggered` and fans out to every configured
 * channel. New channels (email via SMTP, SMS via Twilio, Pagerduty,
 * Slack-specific formatting) plug in by:
 *   1. Implementing `NotificationChannel`.
 *   2. Adding the class to `providers` AND to the
 *      `NOTIFICATION_CHANNELS` factory's `inject` + return array.
 *
 * Channels self-gate via `isEnabled()` so adding a class to the list
 * doesn't force config — an unconfigured channel returns false and
 * is skipped.
 */
@Module({
  providers: [
    LogChannel,
    WebhookChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (log: LogChannel, webhook: WebhookChannel) => [
        log,
        webhook,
      ],
      inject: [LogChannel, WebhookChannel],
    },
    NotificationDispatcher,
  ],
})
export class NotificationsModule {}
