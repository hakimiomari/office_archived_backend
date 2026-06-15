import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { MinioService } from "../minio/minio.service";
import { isSuperAdmin } from "../tenant/tenant-context";
import { CreatePlanRequestDto } from "./dto/create-plan-request.dto";
import { ListPlanRequestsDto } from "./dto/list-plan-requests.dto";

/**
 * Plan-change request lifecycle:
 *
 *   company admin → POST /plan-requests
 *                        ↓ status=PENDING
 *   reviewer → POST /plan-requests/:id/approve
 *                        ↓ status=APPROVED
 *              SubscriptionsService.changePlanForCompany() runs
 *                        ↓ swaps the active subscription
 *
 * Concurrency: at most one PENDING request per company. Enforced at
 * the service layer (create() pre-checks). The reviewer can cancel
 * a request via reject(), and the requester can cancel via cancel().
 *
 * Receipts: optional. When uploaded, stored in MinIO under
 * `plan-requests/<companyId>/<filename>`. The reviewer can fetch a
 * presigned URL via getReceiptUrl(id) to view it.
 */
@Injectable()
export class PlanRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly minio: MinioService,
  ) {}

  // Always pulls company / plans / users for display.
  private readonly defaultInclude = {
    company: { select: { id: true, name: true, slug: true } },
    requestedPlan: { select: { id: true, name: true, slug: true } },
    currentPlan: { select: { id: true, name: true, slug: true } },
    reviewedBy: { select: { id: true, name: true, email: true } },
    createdBy: { select: { id: true, name: true, email: true } },
  } satisfies Prisma.PlanChangeRequestInclude;

  // ────────────────────────────────────────────────────────────────
  // Company-admin side
  // ────────────────────────────────────────────────────────────────

  /**
   * Create a request. SUPER_ADMIN can't create on behalf of a tenant
   * here (they'd use /admin/subscriptions directly); this endpoint is
   * for the tenant themselves.
   */
  async create(
    dto: CreatePlanRequestDto,
    receipt: Express.Multer.File | null,
    actor: { id: number; companyId: number | null },
  ) {
    if (actor.companyId == null) {
      throw new ForbiddenException(
        "Only company users can submit plan-change requests",
      );
    }

    // Verify target plan exists, is active, and is different from
    // whatever the company currently has.
    const plan = await this.prisma.plan.findFirst({
      where: { id: dto.requestedPlanId, isActive: true, deletedAt: null },
    });
    if (!plan) {
      throw new BadRequestException("Requested plan not found or inactive");
    }

    const currentSub = await this.prisma.companySubscription.findFirst({
      where: { companyId: actor.companyId, status: "ACTIVE", deletedAt: null },
      orderBy: { startDate: "desc" },
      include: { plan: { select: { id: true, name: true, sortOrder: true } } },
    });

    // Tier + lifecycle rules. A company can only request:
    //   - a HIGHER-tier plan (upgrade), OR
    //   - the SAME plan ONLY after the current subscription expires
    //     (renewal). Same plan with a different cycle while still
    //     active counts as a re-request and is blocked.
    // Downgrades are never allowed. With no active subscription,
    // any plan is permitted.
    if (currentSub && currentSub.plan) {
      const now = new Date();
      const isExpired =
        currentSub.endDate != null &&
        currentSub.endDate.getTime() <= now.getTime();

      const goingToSamePlan = currentSub.planId === dto.requestedPlanId;
      const goingHigher = plan.sortOrder > currentSub.plan.sortOrder;

      if (!goingToSamePlan && !goingHigher) {
        throw new ConflictException({
          code: "plan_request.downgrade_not_allowed",
          message:
            `Downgrading from ${currentSub.plan.name} to ${plan.name} ` +
            `isn't allowed. You can only upgrade to a higher-tier plan.`,
        });
      }

      if (goingToSamePlan && !isExpired) {
        const expiryText = currentSub.endDate
          ? ` You can renew it after ${currentSub.endDate.toISOString().slice(0, 10)}.`
          : "";
        throw new ConflictException({
          code: "plan_request.already_active",
          message:
            `You're already on the ${plan.name} plan and it hasn't expired yet.` +
            expiryText,
          currentPlan: currentSub.plan.name,
          currentEndDate: currentSub.endDate,
        });
      }
    }

    // Single-pending invariant — at most one PENDING per company.
    const existing = await this.prisma.planChangeRequest.findFirst({
      where: {
        companyId: actor.companyId,
        status: "PENDING",
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException({
        code: "plan_request.pending_exists",
        message:
          "You already have a pending plan-change request. " +
          "Cancel it before submitting a new one.",
        existingRequestId: existing.id,
      });
    }

    let receiptUrl: string | null = null;
    let receiptFileName: string | null = null;
    if (receipt) {
      const uploaded = await this.minio.upload(
        receipt,
        `plan-requests/${actor.companyId}`,
      );
      receiptUrl = uploaded.url;
      receiptFileName = uploaded.fileName;
    }

    return this.prisma.planChangeRequest.create({
      data: {
        companyId: actor.companyId,
        requestedPlanId: dto.requestedPlanId,
        currentPlanId: currentSub?.planId ?? null,
        billingCycle: dto.billingCycle,
        notes: dto.notes ?? null,
        receiptUrl,
        receiptFileName,
        createdById: actor.id,
      } as any,
      include: this.defaultInclude,
    });
  }

  /**
   * List the calling company's own requests (any status), newest first.
   */
  async listMine(companyId: number) {
    return this.prisma.planChangeRequest.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: this.defaultInclude,
    });
  }

  /** Returns the current PENDING request for the company, or null. */
  async getPendingForCompany(companyId: number) {
    return this.prisma.planChangeRequest.findFirst({
      where: { companyId, status: "PENDING", deletedAt: null },
      include: this.defaultInclude,
    });
  }

  /** Requester cancels their own pending request. */
  async cancel(id: number, actor: { id: number; companyId: number | null }) {
    const req = await this.prisma.planChangeRequest.findFirst({
      where: { id, deletedAt: null },
    });
    if (!req) throw new NotFoundException(`Request ${id} not found`);
    if (!isSuperAdmin() && req.companyId !== actor.companyId) {
      throw new ForbiddenException("You can't cancel this request");
    }
    if (req.status !== "PENDING") {
      throw new ConflictException(
        `Request is already ${req.status.toLowerCase()}`,
      );
    }
    return this.prisma.planChangeRequest.update({
      where: { id },
      data: { status: "CANCELLED" } as any,
      include: this.defaultInclude,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Reviewer side
  // ────────────────────────────────────────────────────────────────

  async listAll(filters: ListPlanRequestsDto) {
    const where: Prisma.PlanChangeRequestWhereInput = { deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.companyId) where.companyId = filters.companyId;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const [items, total] = await Promise.all([
      this.prisma.planChangeRequest.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: this.defaultInclude,
      }),
      this.prisma.planChangeRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: number, actor: { companyId: number | null }) {
    const req = await this.prisma.planChangeRequest.findFirst({
      where: { id, deletedAt: null },
      include: this.defaultInclude,
    });
    if (!req) throw new NotFoundException(`Request ${id} not found`);
    // Non-reviewer (company admin) can only see their own.
    if (!isSuperAdmin() && req.companyId !== actor.companyId) {
      throw new ForbiddenException("You can't view this request");
    }
    return req;
  }

  /**
   * Approve → swap the company's subscription immediately and mark
   * the request approved. Wrapped in the same logical flow so a
   * failure in changePlanForCompany leaves the request PENDING.
   */
  async approve(
    id: number,
    reviewer: { id: number; email: string },
    reviewNotes?: string,
  ) {
    const req = await this.prisma.planChangeRequest.findFirst({
      where: { id, deletedAt: null },
    });
    if (!req) throw new NotFoundException(`Request ${id} not found`);
    if (req.status !== "PENDING") {
      throw new ConflictException(
        `Request is already ${req.status.toLowerCase()}`,
      );
    }

    // Swap subscription FIRST. If it throws, request stays PENDING
    // for retry. If it succeeds, mark approved.
    await this.subscriptions.changePlanForCompany(
      req.companyId,
      req.requestedPlanId,
      req.billingCycle,
      {
        actor: reviewer.email,
        reason: "manual",
      },
    );

    return this.prisma.planChangeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      } as any,
      include: this.defaultInclude,
    });
  }

  async reject(
    id: number,
    reviewer: { id: number },
    reviewNotes?: string,
  ) {
    const req = await this.prisma.planChangeRequest.findFirst({
      where: { id, deletedAt: null },
    });
    if (!req) throw new NotFoundException(`Request ${id} not found`);
    if (req.status !== "PENDING") {
      throw new ConflictException(
        `Request is already ${req.status.toLowerCase()}`,
      );
    }
    return this.prisma.planChangeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      } as any,
      include: this.defaultInclude,
    });
  }

  /**
   * Generate a short-lived presigned URL for the stored receipt so
   * the reviewer can preview it without exposing the underlying
   * MinIO endpoint to the browser. Returns null if no receipt.
   */
  async getReceiptPresignedUrl(id: number, actor: { companyId: number | null }) {
    const req = await this.getById(id, actor);
    if (!req.receiptFileName) return null;
    const url = await this.minio.getPresignedUrl(req.receiptFileName, 60 * 10);
    return { url };
  }
}
