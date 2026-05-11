import { Global, Module } from "@nestjs/common";
import { EventBus } from "./event-bus.service";
import { EventLoggerListener } from "./listeners/event-logger.listener";

/**
 * Global so producer services in any module can inject `EventBus` without
 * each module importing this. The `EventEmitterModule.forRoot()` itself is
 * registered once in `AppModule`.
 *
 * Listener providers live here too — adding a new listener means:
 *   1. Create a class with `@Injectable()` + `@OnEvent(EVENTS.WHATEVER)`
 *      methods (see `listeners/event-logger.listener.ts` for the pattern).
 *   2. Add it to `providers` below.
 */
@Global()
@Module({
  providers: [EventBus, EventLoggerListener],
  exports: [EventBus],
})
export class EventsModule {}
