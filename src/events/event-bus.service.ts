import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getTenantContext } from "../tenant/tenant-context";
import { EventName, PayloadByEvent } from "./event-types";

/**
 * Typed wrapper around `EventEmitter2`. Forces the caller to pass the
 * payload shape declared in `PayloadByEvent` for the event name they
 * choose, so a typo in either the name or a field breaks at compile time.
 *
 * On `emit()` we also auto-fill `requestId` / `userId` from the active
 * tenant context if the caller didn't supply them — keeps the call sites
 * tidy while still letting cron / background producers pass explicit
 * values.
 *
 * Listeners typically wrap their body in
 *   await this.tenants.runForCompany(payload.companyId, async () => { … })
 * so their Prisma calls are tenant-scoped — events run outside any HTTP
 * request, so without that re-entry the extension sees no context.
 */
@Injectable()
export class EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<E extends EventName>(event: E, payload: PayloadByEvent[E]): void {
    const ctx = getTenantContext();
    const enriched = {
      ...payload,
      requestId: payload.requestId ?? ctx?.requestId ?? null,
      userId: payload.userId ?? ctx?.userId ?? null,
    };
    this.emitter.emit(event, enriched);
  }

  /** Async-await variant; awaits all listener promises before resolving. */
  async emitAndWait<E extends EventName>(
    event: E,
    payload: PayloadByEvent[E],
  ): Promise<unknown[]> {
    const ctx = getTenantContext();
    const enriched = {
      ...payload,
      requestId: payload.requestId ?? ctx?.requestId ?? null,
      userId: payload.userId ?? ctx?.userId ?? null,
    };
    return this.emitter.emitAsync(event, enriched);
  }
}
