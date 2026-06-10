import { Global, Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionLimitService } from "./subscription-limit.service";
import { SubscriptionModuleGuard } from "./guards/subscription-module.guard";
import { SubscriptionFeatureGuard } from "./guards/subscription-feature.guard";

/**
 * @Global so any feature module can inject `SubscriptionLimitService`
 * + `SubscriptionsService` without explicit `imports:` plumbing.
 *
 * The two guards are exported (not registered as APP_GUARDs) so each
 * controller opts in via `@UseGuards(...)`. Adding them globally
 * would force every existing controller to also opt out — overly
 * invasive for the initial rollout. Per-controller wiring keeps the
 * change surface predictable.
 */
@Global()
@Module({
  // AuthModule is needed so SubscriptionsController can use AuthGuard
  // (AuthGuard depends on TokenProvider). `forwardRef` because the auth
  // graph is large and we don't want load-order edge cases.
  imports: [PrismaModule, RedisModule, forwardRef(() => AuthModule)],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionLimitService,
    SubscriptionModuleGuard,
    SubscriptionFeatureGuard,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionLimitService,
    SubscriptionModuleGuard,
    SubscriptionFeatureGuard,
  ],
})
export class SubscriptionsModule {}
