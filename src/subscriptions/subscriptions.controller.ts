import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BillingCycle } from "@prisma/client";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "../tenant/super-admin.guard";
import { PlanEditorGuard } from "./guards/plan-editor.guard";
import { SubscriptionsService } from "./subscriptions.service";
import {
  CreatePlanDto,
  ReplaceFeaturesDto,
  ReplaceModulesDto,
  PlanLimitInputDto,
  UpdatePlanDto,
} from "./dto/plan.dto";
import {
  ChangePlanDto,
  CreateSubscriptionDto,
  SubscriptionFilterDto,
} from "./dto/subscription.dto";

/**
 * The tenant-facing endpoint (`/subscriptions/current`) is open to any
 * authenticated user — the response is naturally scoped to the
 * caller's company via `req.user.companyId`.
 *
 * Plan and subscription administration are SUPER_ADMIN-only.
 */
@ApiTags("Subscriptions")
@Controller()
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  // ────────────────────────────────────────────────────────────────
  // Tenant-facing
  // ────────────────────────────────────────────────────────────────

  @Get("subscriptions/current")
  @ApiOperation({
    summary: "Active subscription + current usage for the caller",
  })
  async current(@Req() req: any) {
    const companyId: number | null = req.user?.companyId ?? null;
    return this.subs.getCurrentWithUsage(companyId);
  }

  // ────────────────────────────────────────────────────────────────
  // SUPER_ADMIN: plan CRUD
  // ────────────────────────────────────────────────────────────────

  @Get("admin/plans")
  @UseGuards(PlanEditorGuard)
  @ApiOperation({ summary: "List all plans" })
  listPlans() {
    return this.subs.listPlans();
  }

  @Post("admin/plans")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Create a new plan" })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subs.createPlan({
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      monthlyPrice: dto.monthlyPrice,
      yearlyPrice: dto.yearlyPrice,
      sortOrder: dto.sortOrder,
      modules: dto.modules,
      features: dto.features,
      limit: dto.limit
        ? {
            maxUsers: dto.limit.maxUsers,
            maxWarehouses: dto.limit.maxWarehouses,
            maxItems: dto.limit.maxItems,
            maxEmployees: dto.limit.maxEmployees,
            storageGb: dto.limit.storageGb,
          }
        : undefined,
    });
  }

  @Get("admin/plans/:id")
  @UseGuards(PlanEditorGuard)
  getPlan(@Param("id", ParseIntPipe) id: number) {
    return this.subs.getPlan(id);
  }

  @Patch("admin/plans/:id")
  @UseGuards(PlanEditorGuard)
  updatePlan(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.subs.updatePlan(id, dto);
  }

  @Delete("admin/plans/:id")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Soft-delete a plan (refused while any ACTIVE subscription uses it)",
  })
  deletePlan(@Param("id", ParseIntPipe) id: number) {
    return this.subs.deletePlan(id);
  }

  @Put("admin/plans/:id/modules")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Replace the plan's module set" })
  replaceModules(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReplaceModulesDto,
  ) {
    return this.subs.replacePlanModules(id, dto.codes);
  }

  @Put("admin/plans/:id/features")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Replace the plan's feature set" })
  replaceFeatures(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReplaceFeaturesDto,
  ) {
    return this.subs.replacePlanFeatures(id, dto.codes);
  }

  @Put("admin/plans/:id/limit")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Set/replace the plan's limit row" })
  setLimit(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: PlanLimitInputDto,
  ) {
    return this.subs.setPlanLimit(id, dto);
  }

  // ────────────────────────────────────────────────────────────────
  // SUPER_ADMIN: subscription assignment
  // ────────────────────────────────────────────────────────────────

  @Get("admin/subscriptions")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "List subscriptions (filterable)" })
  listSubscriptions(@Query() q: SubscriptionFilterDto) {
    return this.subs.listSubscriptions({
      companyId: q.companyId,
      planId: q.planId,
      status: q.status,
    });
  }

  @Get("admin/subscriptions/companies/:companyId")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Get the active subscription for one company" })
  getActiveForCompany(@Param("companyId", ParseIntPipe) companyId: number) {
    return this.subs.getActiveSubscriptionRowForCompany(companyId);
  }

  @Post("admin/subscriptions")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Manually create a subscription" })
  createSubscription(@Body() dto: CreateSubscriptionDto, @Req() req: any) {
    return this.subs.createSubscription({
      companyId: dto.companyId,
      planId: dto.planId,
      cycle: dto.cycle,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      // Treat the omitted `endDate` field as "let cycle decide"; an
      // explicit `null` keeps the open-ended behaviour.
      endDate:
        dto.endDate === undefined
          ? undefined
          : dto.endDate === null
            ? null
            : new Date(dto.endDate),
      autoRenew: dto.autoRenew,
      notes: dto.notes,
      actor: req.user?.email,
    });
  }

  @Post("admin/subscriptions/:id/upgrade")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Move the company to a higher plan" })
  upgrade(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ChangePlanDto,
    @Req() req: any,
  ) {
    return this.changePlanFor(
      id,
      dto.planId,
      dto.cycle,
      "upgrade",
      req.user?.email,
      dto.startDate,
    );
  }

  @Post("admin/subscriptions/:id/downgrade")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Move the company to a lower plan" })
  downgrade(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ChangePlanDto,
    @Req() req: any,
  ) {
    return this.changePlanFor(
      id,
      dto.planId,
      dto.cycle,
      "downgrade",
      req.user?.email,
      dto.startDate,
    );
  }

  @Post("admin/subscriptions/:id/cancel")
  @UseGuards(SuperAdminGuard)
  @HttpCode(200)
  cancel(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    return this.subs.cancelSubscription(id, req.user?.email);
  }

  private async changePlanFor(
    subscriptionId: number,
    planId: number,
    cycle: BillingCycle,
    reason: "upgrade" | "downgrade",
    actor?: string,
    startDate?: string,
  ) {
    // Locate the subscription's company so the service can swap plans.
    const current =
      await (this.subs as any).rawDb.companySubscription.findUnique({
        where: { id: subscriptionId },
      });
    if (!current) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    return this.subs.changePlanForCompany(
      current.companyId,
      planId,
      cycle,
      {
        actor,
        reason,
        startDate: startDate ? new Date(startDate) : undefined,
      },
    );
  }
}
