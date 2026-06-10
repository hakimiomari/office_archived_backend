import { SetMetadata } from "@nestjs/common";
import { ModuleCode } from "@prisma/client";
import { REQUIRE_MODULE_KEY } from "../subscription.constants";

/**
 * Mark a controller / route as requiring a specific subscription module.
 * The `SubscriptionModuleGuard` reads this metadata and rejects requests
 * whose company's active plan does not include the module.
 *
 * Usage:
 *   @RequireModule('ACCOUNTING')
 *   @Controller('accounting')
 *   export class AccountingController { ... }
 */
export const RequireModule = (code: ModuleCode) =>
  SetMetadata(REQUIRE_MODULE_KEY, code);
