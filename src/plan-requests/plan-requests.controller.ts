import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/guard/auth.guard";
import { PlanRequestsService } from "./plan-requests.service";
import { PlanRequestReviewerGuard } from "./guards/plan-request-reviewer.guard";
import { CreatePlanRequestDto } from "./dto/create-plan-request.dto";
import { ReviewNotesDto } from "./dto/reject-plan-request.dto";
import { ListPlanRequestsDto } from "./dto/list-plan-requests.dto";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function actorFromReq(req: any) {
  const u = req.user ?? {};
  return {
    id: u.id ?? u.sub,
    email: u.email,
    companyId: u.companyId ?? null,
  };
}

@ApiTags("Plan change requests")
@ApiBearerAuth()
@Controller("plan-requests")
@UseGuards(AuthGuard)
export class PlanRequestsController {
  constructor(private readonly service: PlanRequestsService) {}

  // ────────────────────────────────────────────────────────────────
  // Company-admin endpoints
  // ────────────────────────────────────────────────────────────────

  @Post()
  @UseInterceptors(FileInterceptor("receipt"))
  async create(
    @Body() dto: CreatePlanRequestDto,
    @UploadedFile() receipt: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (receipt) {
      if (receipt.size > MAX_RECEIPT_BYTES) {
        throw new BadRequestException("Receipt must be 5MB or smaller");
      }
      if (!ALLOWED_MIME.has(receipt.mimetype)) {
        throw new BadRequestException(
          "Receipt must be an image (PNG, JPG, WebP, GIF) or PDF",
        );
      }
    }
    const actor = actorFromReq(req);
    return this.service.create(dto, receipt ?? null, actor);
  }

  @Get("mine")
  async listMine(@Req() req: any) {
    const actor = actorFromReq(req);
    if (actor.companyId == null) return [];
    return this.service.listMine(actor.companyId);
  }

  @Get("mine/pending")
  async getMinePending(@Req() req: any) {
    const actor = actorFromReq(req);
    if (actor.companyId == null) return null;
    return this.service.getPendingForCompany(actor.companyId);
  }

  @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    return this.service.cancel(id, actorFromReq(req));
  }

  // ────────────────────────────────────────────────────────────────
  // Reviewer endpoints (SUPER_ADMIN or `plan_request.review`)
  // ────────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(PlanRequestReviewerGuard)
  async listAll(@Query() filters: ListPlanRequestsDto) {
    return this.service.listAll(filters);
  }

  @Get(":id")
  async getOne(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    // Owners can also view their own request — getById handles the
    // tenant scoping. Reviewer guard isn't applied here so a company
    // admin can also fetch detail of their own request.
    return this.service.getById(id, actorFromReq(req));
  }

  @Get(":id/receipt")
  async getReceiptUrl(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.getReceiptPresignedUrl(id, actorFromReq(req));
  }

  @Post(":id/approve")
  @UseGuards(PlanRequestReviewerGuard)
  async approve(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReviewNotesDto,
    @Req() req: any,
  ) {
    const u = req.user ?? {};
    return this.service.approve(
      id,
      { id: u.id ?? u.sub, email: u.email },
      body.reviewNotes,
    );
  }

  @Post(":id/reject")
  @UseGuards(PlanRequestReviewerGuard)
  async reject(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReviewNotesDto,
    @Req() req: any,
  ) {
    const u = req.user ?? {};
    return this.service.reject(
      id,
      { id: u.id ?? u.sub },
      body.reviewNotes,
    );
  }
}
