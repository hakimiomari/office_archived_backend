import { AlertTriggeredPayload } from "../events/event-types";

/**
 * A notification channel is anything that knows how to deliver an
 * alert. Implementations live as Nest providers and are injected into
 * `NotificationDispatcher` via a multi-provider token (`NOTIFICATION_CHANNELS`).
 *
 * Channels MUST:
 *  - Be cheap to call when not configured (e.g. webhook channel checks
 *    its env var and is a no-op when unset).
 *  - Catch their own errors. The dispatcher already runs them in a
 *    Promise.allSettled, but a channel that swallows + logs locally
 *    will produce more useful diagnostics than the dispatcher's
 *    generic "channel X failed" line.
 *  - Be idempotent if at all possible. The dispatcher uses
 *    `Alert.dispatchedAt` to avoid re-dispatching, but network retries
 *    happen.
 */
export interface NotificationChannel {
  /** Stable identifier used in logs / future audit rows. */
  readonly name: string;

  /** True when this channel is configured and should be tried. */
  isEnabled(): boolean;

  /** Send the alert through this channel. */
  send(payload: AlertTriggeredPayload): Promise<void>;
}

/** DI token for the multi-provider array of channels. */
export const NOTIFICATION_CHANNELS = Symbol("NOTIFICATION_CHANNELS");
