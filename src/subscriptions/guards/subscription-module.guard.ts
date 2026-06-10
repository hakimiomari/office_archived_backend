import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ModuleCode } from "@prisma/client";
import {
  REQUIRE_MODULE_KEY,
  isSubscriptionEnforced,
} from "../subscription.constants";
import { effectiveCompanyId } from "../../tenant/tenant-context";
import { SubscriptionsService } from "../subscriptions.service";

/**
 * Reads the `@RequireModule(...)` metadata on the handler/class and
 * rejects requests whose company's active plan doesn't include the
 * module. SUPER_ADMIN callers are exempt (they have no companyId
 * anyway). Routes without the decorator pass through.
 *
 * Warn-only mode: when `SUBSCRIPTION_ENFORCE !== "1"` the guard logs
 * what it would have blocked but lets the request through. Flip the
 * env var to start throwing.
 */
@Injectable()
export class SubscriptionModuleGuard implements CanActivate {
  private readonly logger = new Logger("SubscriptionModuleGuard");

  constructor(
    private readonly reflector: Reflector,
    private readonly subs: SubscriptionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleCode | undefined>(
      REQUIRE_MODULE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true; // route is not gated by a module

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) return true; // unauthenticated routes (login) — AuthGuard handles

    // SUPER_ADMIN routing rule:
    //  - unscoped (acting globally, no X-Tenant-Company-Id) → bypass
    //  - scoped into a tenant → enforce that tenant's plan
    const effective = effectiveCompanyId();
    if (user.userRole === "SUPER_ADMIN" && effective == null) return true;

    const companyId: number | null = effective ?? user.companyId ?? null;
    const sub = await this.subs.getActiveForCompany(companyId);

    const reason = (code: string, extra: Record<string, unknown> = {}) => ({
      code,
      module: required,
      companyId,
      ...extra,
    });

    let payload: ReturnType<typeof reason> | null = null;

    if (!sub) {
      payload = reason("subscription.missing");
    } else if (sub.status !== "ACTIVE") {
      payload = reason("subscription.inactive", { status: sub.status });
    } else if (sub.endDate && new Date(sub.endDate) < new Date()) {
      payload = reason("subscription.expired", { endDate: sub.endDate });
    } else if (!sub.modules.includes(required)) {
      payload = reason("subscription.module.disabled", {
        planSlug: sub.plan.slug,
      });
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
