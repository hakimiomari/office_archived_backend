import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { BankAccountsService } from "./bank-accounts.service";
import { BankTransactionsService } from "./bank-transactions.service";
import { ReconciliationsService } from "./reconciliations.service";
import { BankingController } from "./banking.controller";

/**
 * Banking module (§5.2). Three services + one combined controller:
 *  - `BankAccountsService`        — bank account CRUD per tenant.
 *  - `BankTransactionsService`    — single + bulk import, manual match,
 *                                   unmatch / ignore, auto-match.
 *  - `ReconciliationsService`     — open / close periods, compute
 *                                   book balance vs statement balance.
 *
 * Posting these transactions into the GL is the responsibility of
 * §5.1 (Sale/Payment/Purchase events already fire). When the auto-match
 * service confirms a Payment ↔ BankTransaction pairing, the underlying
 * Payment was already posted on its own — bank reconciliation does
 * not create new journal entries.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BankingController],
  providers: [
    BankAccountsService,
    BankTransactionsService,
    ReconciliationsService,
  ],
  exports: [
    BankAccountsService,
    BankTransactionsService,
    ReconciliationsService,
  ],
})
export class BankingModule {}
