import { SetMetadata } from "@nestjs/common";
import { FeatureCode } from "@prisma/client";
import { REQUIRE_FEATURE_KEY } from "../subscription.constants";

/**
 * Mark a route as requiring a specific premium feature within an
 * already-enabled module. `SubscriptionFeatureGuard` enforces it.
 *
 * Usage:
 *   @RequireFeature('BANK_RECONCILIATION')
 *   @Post('reconciliations/:id/close')
 *   close(...) { ... }
 */
export const RequireFeature = (code: FeatureCode) =>
  SetMetadata(REQUIRE_FEATURE_KEY, code);
