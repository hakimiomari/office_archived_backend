import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { ChartOfAccountsService } from "./chart-of-accounts.service";
import { LedgerService } from "./ledger.service";
import { JournalListener } from "./journal.listener";
import { AccountingController } from "./accounting.controller";

/**
 * Accounting module (§5.1). Hosts:
 *  - `ChartOfAccountsService` — default chart seed + per-code lookups.
 *  - `LedgerService`          — balanced `JournalEntry` poster +
 *                               idempotent posting by (sourceType, sourceId).
 *  - `JournalListener`        — subscribes to §3.1 events and routes them
 *                               to the right `LedgerService.postXxx` call.
 *  - `AccountingController`   — SUPER_ADMIN-only chart + ledger query API.
 *
 * The services are exported so other modules (CompaniesService for
 * auto-seed on tenant creation) can inject them.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccountingController],
  providers: [ChartOfAccountsService, LedgerService, JournalListener],
  exports: [ChartOfAccountsService, LedgerService],
})
export class AccountingModule {}
