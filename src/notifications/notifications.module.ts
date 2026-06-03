import { Module } from "@nestjs/common";
import { LogChannel } from "./channels/log.channel";
import { NotificationDispatcher } from "./notification-dispatcher.service";
import { NOTIFICATION_CHANNELS } from "./notification-channel";

/**
 * Offline-only build: only the local LogChannel is wired. Channels that
 * reach the internet (webhooks, email/SMTP, SMS) have been removed.
 */
@Module({
  providers: [
    LogChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (log: LogChannel) => [log],
      inject: [LogChannel],
    },
    NotificationDispatcher,
  ],
})
export class NotificationsModule {}
