import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { isSuperAdmin } from "../tenant/tenant-context";
import { SubscriptionsService } from "./subscriptions.service";
import { isSubscriptionEnforced } from "./subscription.constants";

type LimitKey = "maxUsers" | "maxWarehouses" | "maxItems" | "maxEmployees";

const LIMIT_LABEL: Record<LimitKey, string> = {
  maxUsers: "users",
  maxWarehouses: "warehouses",
  maxItems: "items",
  maxEmployees: "employees",
};

/**
 * Per-resource limit enforcement. Called from the create paths of
 * user / item / warehouse / employee. Bypassed when:
 *   - caller is SUPER_ADMIN (no companyId to scope to),
 *   - the company has no active subscription (treated as unlimited —
 *     the module guard will catch a totally unsubscribed tenant),
 *   - the plan does not specify the limit (null = unlimited),
 *   - SUBSCRIPTION_ENFORCE !== "1" (warn-only mode: logs the would-be
 *     denial and lets the write succeed).
 */
@Injectable()
export class SubscriptionLimitService {
  private readonly logger = new Logger("SubscriptionLimitService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
  ) {}

  async assertCanCreateUser(companyId: number | null | undefined) {
    // `User` is intentionally excluded from TENANT_MODELS so the auth
    // flow can find SUPER_ADMINs (companyId === null). That means
    // `prisma.user.count()` does NOT auto-scope to the tenant, so we
    // must filter explicitly here — otherwise a Basic tenant's cap
    // would compare against the global user count. User has no
    // `deletedAt` column; removal is a hard delete.
    return this.assert(companyId, "maxUsers", (cid) =>
      this.prisma.user.count({ where: { companyId: cid } }),
    );
  }

  async assertCanCreateWarehouse(companyId: number | null | undefined) {
    return this.assert(companyId, "maxWarehouses", (cid) =>
      this.prisma.warehouse.count({
        where: { companyId: cid, deletedAt: null } as any,
      }),
    );
  }

  async assertCanCreateItem(companyId: number | null | undefined) {
    return this.assert(companyId, "maxItems", (cid) =>
      this.prisma.item.count({
        where: { companyId: cid, deletedAt: null } as any,
      }),
    );
  }

  async assertCanCreateEmployee(companyId: number | null | undefined) {
    return this.assert(companyId, "maxEmployees", (cid) =>
      this.prisma.employee.count({
        where: { companyId: cid, deletedAt: null } as any,
      }),
    );
  }

  // ────────────────────────────────────────────────────────────────

  private async assert(
    companyId: number | null | undefined,
    key: LimitKey,
    counter: (companyId: number) => Promise<number>,
  ) {
    if (companyId == null) return; // SUPER_ADMIN — nothing to enforce
    if (isSuperAdmin()) return;

    const sub = await this.subs.getActiveForCompany(companyId);
    if (!sub) return; // no active subscription — module guard handles
    const max = sub.limit?.[key];
    if (max == null) return; // unlimited

    const current = await counter(companyId);
    if (current < max) return; // capacity available

    const message =
      `${LIMIT_LABEL[key]} limit exceeded for ${sub.plan.name} plan ` +
      `(${current}/${max}). Upgrade the subscription to add more.`;

    if (!isSubscriptionEnforced()) {
      this.logger.warn(
        `[warn-only] ${message} (company=${companyId}, plan=${sub.plan.slug})`,
      );
      return;
    }

    throw new ForbiddenException({
      code: "subscription.limit.exceeded",
      limit: key,
      planSlug: sub.plan.slug,
      planName: sub.plan.name,
      current,
      max,
      message,
    });
  }
}
