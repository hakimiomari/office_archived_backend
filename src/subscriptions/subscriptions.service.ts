import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingCycle,
  FeatureCode,
  ModuleCode,
  Plan,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { tenantCreate } from "../tenant/tenant-create";
import { isSuperAdmin } from "../tenant/tenant-context";
import {
  PLAN_SLUGS,
  SUBSCRIPTION_CACHE_KEY,
  SUBSCRIPTION_CACHE_TTL_SECONDS,
} from "./subscription.constants";

/**
 * Shape of the cached subscription snapshot. Plan/PlanModule/PlanFeature
 * /PlanLimit are global, so we flatten everything a guard needs into
 * Sets / plain values to keep the hot path allocation-free.
 */
export type ActiveSubscriptionSnapshot = {
  subscriptionId: number;
  companyId: number;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startDate: string;
  endDate: string | null;
  plan: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    monthlyPrice: number;
    yearlyPrice: number;
  };
  modules: ModuleCode[];
  features: FeatureCode[];
  limit: {
    maxUsers: number | null;
    maxWarehouses: number | null;
    maxItems: number | null;
    maxEmployees: number | null;
    storageGb: number | null;
  } | null;
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger("SubscriptionsService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Plans / PlanModule / PlanFeature / PlanLimit are global config.
   * The tenant-extension auto-scopes everything by `companyId` — which
   * these tables don't have — so we go through the underlying client
   * for plan-side reads to avoid an extension surprise. Reads of
   * `companyId`-bearing `companySubscription` rows must go through the
   * extension as normal.
   */
  private get rawDb() {
    return this.prisma as unknown as PrismaClient;
  }

  /**
   * Compute an absolute `endDate` from the chosen billing cycle.
   *  - MONTHLY  → +30 calendar days
   *  - YEARLY   → +365 calendar days
   *  - PERPETUAL → null (no expiry)
   * Uses day math (not month/year arithmetic) so it stays consistent
   * across DST boundaries and isn't bitten by "Feb 30" edge cases.
   */
  private computeEndDate(
    startDate: Date,
    cycle: BillingCycle,
  ): Date | null {
    if (cycle === "PERPETUAL") return null;
    const days = cycle === "MONTHLY" ? 30 : 365;
    return new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // ────────────────────────────────────────────────────────────────
  // ACTIVE SUBSCRIPTION (hot path — cached)
  // ────────────────────────────────────────────────────────────────

  /**
   * Return the active subscription snapshot for the given company.
   * SUPER_ADMIN callers (no companyId) get null — the guards treat
   * null as "skip the check".
   *
   * Cached in Redis for SUBSCRIPTION_CACHE_TTL_SECONDS to keep
   * per-request overhead at one cache hit. Cache busts happen on
   * upgrade / downgrade / cancel / plan-edit.
   */
  async getActiveForCompany(
    companyId: number | null | undefined,
  ): Promise<ActiveSubscriptionSnapshot | null> {
    if (companyId == null) return null;

    const cacheKey = SUBSCRIPTION_CACHE_KEY(companyId);
    const client = await this.redis.getClient();

    const cached = await client.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as ActiveSubscriptionSnapshot;
      } catch {
        // fall through and re-fetch
      }
    }

    const sub = await this.rawDb.companySubscription.findFirst({
      where: {
        companyId,
        status: "ACTIVE",
        deletedAt: null,
      },
      orderBy: { startDate: "desc" },
      include: {
        plan: {
          include: {
            modules: true,
            features: true,
            limit: true,
          },
        },
      },
    });

    if (!sub) return null;

    const snapshot: ActiveSubscriptionSnapshot = {
      subscriptionId: sub.id,
      companyId: sub.companyId,
      status: sub.status,
      billingCycle: sub.billingCycle,
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate ? sub.endDate.toISOString() : null,
      plan: {
        id: sub.plan.id,
        slug: sub.plan.slug,
        name: sub.plan.name,
        description: sub.plan.description,
        monthlyPrice: sub.plan.monthlyPrice,
        yearlyPrice: sub.plan.yearlyPrice,
      },
      modules: sub.plan.modules.map((m) => m.moduleCode),
      features: sub.plan.features.map((f) => f.featureCode),
      limit: sub.plan.limit
        ? {
            maxUsers: sub.plan.limit.maxUsers,
            maxWarehouses: sub.plan.limit.maxWarehouses,
            maxItems: sub.plan.limit.maxItems,
            maxEmployees: sub.plan.limit.maxEmployees,
            storageGb: sub.plan.limit.storageGb,
          }
        : null,
    };

    await client
      .set(
        cacheKey,
        JSON.stringify(snapshot),
        "EX",
        SUBSCRIPTION_CACHE_TTL_SECONDS,
      )
      .catch(() => {
        /* cache write failure is non-fatal */
      });

    return snapshot;
  }

  /** Mark the cached snapshot stale. Call after any mutation. */
  async invalidateForCompany(companyId: number) {
    const client = await this.redis.getClient();
    await client.del(SUBSCRIPTION_CACHE_KEY(companyId)).catch(() => {
      /* cache delete failure is non-fatal */
    });
  }

  /**
   * Helper used by both the GET /subscriptions/current endpoint and
   * the SubscriptionLimitService — returns the snapshot + a usage
   * summary so the frontend can render progress bars.
   */
  async getCurrentWithUsage(companyId: number | null) {
    const sub = await this.getActiveForCompany(companyId);
    if (!sub) {
      return {
        subscription: null,
        usage: null,
      };
    }
    const usage = await this.computeUsage(sub.companyId);
    return { subscription: sub, usage };
  }

  /**
   * Count rows in each limit-relevant table. Uses the tenant-extended
   * Prisma instance so each query is auto-scoped to the company; we
   * still pass `companyId` through the tenant context (the caller
   * already lives in it).
   */
  async computeUsage(companyId: number) {
    // The extension already injects companyId from the request context;
    // we wrap in `runForCompany` only if called outside a request (e.g.
    // from a cron). Here we trust the caller.
    void companyId;
    const [users, warehouses, items, employees] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.warehouse.count(),
      this.prisma.item.count(),
      this.prisma.employee.count(),
    ]);
    return { users, warehouses, items, employees };
  }

  // ────────────────────────────────────────────────────────────────
  // PLAN CRUD (SUPER_ADMIN only — controller enforces)
  // ────────────────────────────────────────────────────────────────

  async listPlans() {
    return this.rawDb.plan.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { modules: true, features: true, limit: true },
    });
  }

  async getPlan(id: number) {
    const plan = await this.rawDb.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        modules: true,
        features: true,
        limit: true,
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return plan;
  }

  async createPlan(data: {
    name: string;
    slug: string;
    description?: string;
    monthlyPrice?: number;
    yearlyPrice?: number;
    sortOrder?: number;
    modules?: ModuleCode[];
    features?: FeatureCode[];
    limit?: {
      maxUsers?: number | null;
      maxWarehouses?: number | null;
      maxItems?: number | null;
      maxEmployees?: number | null;
      storageGb?: number | null;
    };
  }) {
    try {
      return await this.rawDb.plan.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          monthlyPrice: data.monthlyPrice ?? 0,
          yearlyPrice: data.yearlyPrice ?? 0,
          sortOrder: data.sortOrder ?? 0,
          modules: data.modules?.length
            ? { create: data.modules.map((m) => ({ moduleCode: m })) }
            : undefined,
          features: data.features?.length
            ? { create: data.features.map((f) => ({ featureCode: f })) }
            : undefined,
          limit: data.limit ? { create: data.limit } : undefined,
        },
        include: { modules: true, features: true, limit: true },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictException(`Plan slug "${data.slug}" already exists`);
      }
      throw err;
    }
  }

  async updatePlan(
    id: number,
    data: {
      name?: string;
      description?: string;
      monthlyPrice?: number;
      yearlyPrice?: number;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    await this.getPlan(id);
    const updated = await this.rawDb.plan.update({
      where: { id },
      data,
    });
    await this.invalidateAllSubscriptionsForPlan(id);
    return updated;
  }

  async deletePlan(id: number) {
    const inUse = await this.rawDb.companySubscription.count({
      where: { planId: id, status: "ACTIVE", deletedAt: null },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `Plan has ${inUse} ACTIVE subscription(s) — re-assign them before deleting`,
      );
    }
    await this.rawDb.plan.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  async replacePlanModules(id: number, codes: ModuleCode[]) {
    await this.getPlan(id);
    await this.rawDb.$transaction([
      this.rawDb.planModule.deleteMany({ where: { planId: id } }),
      ...(codes.length
        ? [
            this.rawDb.planModule.createMany({
              data: codes.map((c) => ({ planId: id, moduleCode: c })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    await this.invalidateAllSubscriptionsForPlan(id);
    return this.getPlan(id);
  }

  async replacePlanFeatures(id: number, codes: FeatureCode[]) {
    await this.getPlan(id);
    await this.rawDb.$transaction([
      this.rawDb.planFeature.deleteMany({ where: { planId: id } }),
      ...(codes.length
        ? [
            this.rawDb.planFeature.createMany({
              data: codes.map((c) => ({ planId: id, featureCode: c })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    await this.invalidateAllSubscriptionsForPlan(id);
    return this.getPlan(id);
  }

  async setPlanLimit(
    id: number,
    limit: {
      maxUsers?: number | null;
      maxWarehouses?: number | null;
      maxItems?: number | null;
      maxEmployees?: number | null;
      storageGb?: number | null;
    },
  ) {
    await this.getPlan(id);
    const result = await this.rawDb.planLimit.upsert({
      where: { planId: id },
      update: limit,
      create: { planId: id, ...limit },
    });
    await this.invalidateAllSubscriptionsForPlan(id);
    return result;
  }

  // ────────────────────────────────────────────────────────────────
  // SUBSCRIPTION CRUD (SUPER_ADMIN only — controller enforces)
  // ────────────────────────────────────────────────────────────────

  async listSubscriptions(filters: {
    companyId?: number;
    planId?: number;
    status?: SubscriptionStatus;
  }) {
    const where: Prisma.CompanySubscriptionWhereInput = {
      deletedAt: null,
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.planId && { planId: filters.planId }),
      ...(filters.status && { status: filters.status }),
    };
    return this.rawDb.companySubscription.findMany({
      where,
      include: { plan: true, company: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async getActiveSubscriptionRowForCompany(companyId: number) {
    return this.rawDb.companySubscription.findFirst({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      include: { plan: { include: { limit: true } } },
      orderBy: { startDate: "desc" },
    });
  }

  /**
   * Move a company to a different plan. Marks the current ACTIVE
   * row CANCELLED and inserts a fresh ACTIVE row with the new
   * planId. Atomic. Cache is invalidated.
   *
   * The caller must pass a `cycle` (MONTHLY / YEARLY / PERPETUAL).
   * Service computes `endDate` from `startDate + cycle`.
   */
  async changePlanForCompany(
    companyId: number,
    newPlanId: number,
    cycle: BillingCycle,
    opts?: {
      actor?: string;
      reason?: "upgrade" | "downgrade" | "manual";
      startDate?: Date;
    },
  ) {
    const plan = await this.rawDb.plan.findFirst({
      where: { id: newPlanId, deletedAt: null, isActive: true },
    });
    if (!plan) {
      throw new BadRequestException(
        `Target plan ${newPlanId} is missing or inactive`,
      );
    }

    const startDate = opts?.startDate ?? new Date();
    const endDate = this.computeEndDate(startDate, cycle);

    return this.rawDb.$transaction(async (tx) => {
      const current = await tx.companySubscription.findFirst({
        where: { companyId, status: "ACTIVE", deletedAt: null },
        orderBy: { startDate: "desc" },
      });

      if (current?.planId === newPlanId && current.billingCycle === cycle) {
        // No-op — same plan + same cycle; just return the current row.
        return current;
      }

      if (current) {
        await tx.companySubscription.update({
          where: { id: current.id },
          data: {
            status: "CANCELLED",
            endDate: new Date(),
            notes:
              (current.notes ? current.notes + "\n" : "") +
              `Replaced by plan ${plan.slug} / ${cycle} (${
                opts?.reason ?? "manual"
              })${opts?.actor ? ` by ${opts.actor}` : ""}`,
          },
        });
      }

      const created = await tx.companySubscription.create({
        data: {
          companyId,
          planId: newPlanId,
          status: "ACTIVE",
          startDate,
          endDate,
          billingCycle: cycle,
          autoRenew: current?.autoRenew ?? true,
          createdBy: opts?.actor,
        },
      });

      return created;
    }).then(async (row) => {
      await this.invalidateForCompany(companyId);
      return row;
    });
  }

  async cancelSubscription(id: number, actor?: string) {
    const sub = await this.rawDb.companySubscription.findUnique({
      where: { id },
    });
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);
    await this.rawDb.companySubscription.update({
      where: { id },
      data: {
        status: "CANCELLED",
        endDate: new Date(),
        notes:
          (sub.notes ? sub.notes + "\n" : "") +
          `Cancelled${actor ? ` by ${actor}` : ""}`,
      },
    });
    await this.invalidateForCompany(sub.companyId);
    return { ok: true };
  }

  /**
   * Manual creation path for admin tooling. Refuses to insert a
   * second ACTIVE row for the same company — the change-plan flow
   * is the right way to move plans.
   */
  async createSubscription(data: {
    companyId: number;
    planId: number;
    cycle?: BillingCycle;
    startDate?: Date;
    /**
     * Optional explicit endDate. Overrides whatever `cycle` would
     * compute, so an admin can grant a custom-length subscription
     * without picking from the standard cadence.
     */
    endDate?: Date | null;
    autoRenew?: boolean;
    notes?: string;
    actor?: string;
  }) {
    const existing = await this.rawDb.companySubscription.findFirst({
      where: { companyId: data.companyId, status: "ACTIVE", deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `Company ${data.companyId} already has an ACTIVE subscription. Use changePlan instead.`,
      );
    }
    const plan = await this.rawDb.plan.findFirst({
      where: { id: data.planId, deletedAt: null, isActive: true },
    });
    if (!plan) {
      throw new BadRequestException(`Plan ${data.planId} missing or inactive`);
    }

    const cycle: BillingCycle = data.cycle ?? "PERPETUAL";
    const startDate = data.startDate ?? new Date();
    // Explicit endDate (even if null) wins over cycle-derived value so
    // admin overrides aren't silently overwritten.
    const endDate =
      data.endDate !== undefined
        ? data.endDate
        : this.computeEndDate(startDate, cycle);

    const row = await this.rawDb.companySubscription.create({
      data: {
        companyId: data.companyId,
        planId: data.planId,
        startDate,
        endDate,
        billingCycle: cycle,
        autoRenew: data.autoRenew ?? true,
        status: "ACTIVE",
        notes: data.notes,
        createdBy: data.actor,
      },
    });
    await this.invalidateForCompany(data.companyId);
    return row;
  }

  // ────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────

  /** When a plan's modules / features / limits change, every
   *  ACTIVE subscription bound to that plan must drop its cache. */
  private async invalidateAllSubscriptionsForPlan(planId: number) {
    const subs = await this.rawDb.companySubscription.findMany({
      where: { planId, status: "ACTIVE", deletedAt: null },
      select: { companyId: true },
    });
    await Promise.all(
      subs.map((s) => this.invalidateForCompany(s.companyId)),
    );
  }
}
