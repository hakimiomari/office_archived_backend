import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { MinioModule } from "../minio/minio.module";
import { PlanRequestsController } from "./plan-requests.controller";
import { PlanRequestsService } from "./plan-requests.service";
import { PlanRequestReviewerGuard } from "./guards/plan-request-reviewer.guard";

/**
 * Plan-change request flow: company admins request a plan upgrade or
 * downgrade; SUPER_ADMIN or any user granted `plan_request.review`
 * approves/rejects. `SubscriptionsService` is consumed from the global
 * SubscriptionsModule, so no explicit import is needed.
 */
@Module({
  imports: [PrismaModule, MinioModule, forwardRef(() => AuthModule)],
  controllers: [PlanRequestsController],
  providers: [PlanRequestsService, PlanRequestReviewerGuard],
  exports: [PlanRequestsService],
})
export class PlanRequestsModule {}
