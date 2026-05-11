import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "../tenant/super-admin.guard";
import { ChartOfAccountsService } from "./chart-of-accounts.service";
import { LedgerService } from "./ledger.service";

/**
 * Admin endpoints for the accounting layer. Locked behind
 * `SuperAdminGuard` for now — once tenant accountants log in as
 * COMPANY_ADMINs, swap to permission-gated routes (`accounting.read`,
 * `accounting.post`, etc.) and seed those permissions.
 *
 *  - `GET    /accounting/chart`            list the current tenant's chart
 *  - `POST   /accounting/seed`             seed the default chart (idempotent)
 *  - `POST   /accounting/seed-all`         backfill every active tenant
 *  - `GET    /accounting/journal-entries`  list entries (filterable)
 *  - `GET    /accounting/journal-entries/:id`
 */
@ApiTags("Admin / Accounting")
@Controller("accounting")
@UseGuards(AuthGuard, SuperAdminGuard)
export class AccountingController {
  constructor(
    private readonly chart: ChartOfAccountsService,
    private readonly ledger: LedgerService,
  ) {}

  @Get("chart")
  @ApiOperation({ summary: "List the active tenant's chart of accounts" })
  listChart() {
    return this.chart.list();
  }

  @Post("seed")
  @ApiOperation({
    summary: "Seed the default chart for the active tenant (idempotent)",
  })
  seed() {
    return this.chart.seedDefault();
  }

  @Post("seed-all")
  @ApiOperation({
    summary: "Backfill the default chart for every active tenant",
  })
  seedAll() {
    return this.chart.backfillAll();
  }

  @Get("journal-entries")
  @ApiOperation({ summary: "List journal entries" })
  listEntries(
    @Query("sourceType") sourceType?: string,
    @Query("sourceId") sourceId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.ledger.listEntries({
      sourceType,
      sourceId: sourceId ? Number(sourceId) : undefined,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("journal-entries/:id")
  @ApiOperation({ summary: "Get a journal entry with all its lines" })
  getEntry(@Param("id", ParseIntPipe) id: number) {
    return this.ledger.findOneEntry(id);
  }
}
