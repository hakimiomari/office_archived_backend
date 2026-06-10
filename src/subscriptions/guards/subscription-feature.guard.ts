import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FeatureCode } from "@prisma/client";
import {
  REQUIRE_FEATURE_KEY,
  isSubscriptionEnforced,
} from "../subscription.constants";
import { effectiveCompanyId } from "../../tenant/tenant-context";
import { SubscriptionsService } from "../subscriptions.service";

/**
 * Reads the `@RequireFeature(...)` metadata on the handler/class and
 * rejects requests whose company's active plan doesn't include the
 * feature. Same exemptions / warn-only behaviour as
 * SubscriptionModuleGuard.
 */
@Injectable()
export class SubscriptionFeatureGuard implements CanActivate {
  private readonly logger = new Logger("SubscriptionFeatureGuard");

  constructor(
    private readonly reflector: Reflector,
    private readonly subs: SubscriptionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureCode | undefined>(
      REQUIRE_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true;

    // Unscoped SUPER_ADMIN bypasses; scoped SUPER_ADMIN is checked
    // against the impersonated tenant's plan.
    const effective = effectiveCompanyId();
    if (user.userRole === "SUPER_ADMIN" && effective == null) return true;

    const companyId: number | null = effective ?? user.companyId ?? null;
    const sub = await this.subs.getActiveForCompany(companyId);

    let payload: { code: string; feature: FeatureCode; [k: string]: unknown } | null = null;

    if (!sub) {
      payload = { code: "subscription.missing", feature: required, companyId };
    } else if (sub.status !== "ACTIVE") {
      payload = {
        code: "subscription.inactive",
        feature: required,
        companyId,
        status: sub.status,
      };
    } else if (sub.endDate && new Date(sub.endDate) < new Date()) {
      payload = {
        code: "subscription.expired",
        feature: required,
        companyId,
        endDate: sub.endDate,
      };
    } else if (!sub.features.includes(required)) {
      payload = {
        code: "subscription.feature.disabled",
        feature: required,
        planSlug: sub.plan.slug,
        companyId,
      };
    }

    if (!payload) return true;

    if (!isSubscriptionEnforced()) {
      this.logger.warn(
        `[warn-only] would block ${req.method} ${req.url} — ${JSON.stringify(payload)}`,
      );
      return true;
    }

    throw new ForbiddenException(payload);
  }
}
