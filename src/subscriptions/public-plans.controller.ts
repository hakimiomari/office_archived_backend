import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Unauthenticated marketing endpoint. Returns active plans (with
 * modules / features / limits) so the public landing page can render
 * a real pricing grid without going through the SUPER_ADMIN-only
 * /admin/plans route.
 *
 * Kept in its own controller so the main SubscriptionsController can
 * stay locked under `@UseGuards(AuthGuard)` without exceptions.
 */
@ApiTags("Public")
@Controller("plans")
export class PublicPlansController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get("public")
  @ApiOperation({ summary: "List active plans for the marketing site" })
  listPublic() {
    return this.subs.listPublicPlans();
  }
}
