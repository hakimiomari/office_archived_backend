import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "../tenant/super-admin.guard";
import { SubscriptionModuleGuard } from "../subscriptions/guards/subscription-module.guard";
import { SubscriptionFeatureGuard } from "../subscriptions/guards/subscription-feature.guard";
import { RequireModule } from "../subscriptions/decorators/require-module.decorator";
import { RequireFeature } from "../subscriptions/decorators/require-feature.decorator";
import { ModuleCode, FeatureCode } from "@prisma/client";
import { BankAccountsService } from "./bank-accounts.service";
import { BankTransactionsService } from "./bank-transactions.service";
import { ReconciliationsService } from "./reconciliations.service";
import {
  BankTransactionFilterDto,
  CreateBankAccountDto,
  CreateBankTransactionDto,
  CreateReconciliationDto,
  ImportBankTransactionsDto,
  MatchBankTransactionDto,
  UpdateBankAccountDto,
} from "./banking.dto";

/**
 * Banking + reconciliation endpoints. Locked to SUPER_ADMIN for v1 —
 * COMPANY_ADMIN-level access will follow once banking permissions are
 * seeded.
 *
 * Route shape:
 *  - `/banking/accounts/*`          → bank account CRUD
 *  - `/banking/transactions/*`      → list / create / import / match
 *  - `/banking/reconciliations/*`   → open / close / list
 */
@ApiTags("Banking / Reconciliation")
@Controller("banking")
@UseGuards(
  AuthGuard,
  SubscriptionModuleGuard,
  SubscriptionFeatureGuard,
  SuperAdminGuard,
)
@RequireModule(ModuleCode.BANKING)
export class BankingController {
  constructor(
    private readonly accounts: BankAccountsService,
    private readonly transactions: BankTransactionsService,
    private readonly reconciliations: ReconciliationsService,
  ) {}

  // ─────────────── Bank accounts ───────────────

  @Post("accounts")
  @ApiOperation({ summary: "Create a bank account" })
  createAccount(@Body() dto: CreateBankAccountDto) {
    return this.accounts.create(dto);
  }

  @Get("accounts")
  @ApiOperation({ summary: "List bank accounts" })
  listAccounts() {
    return this.accounts.findAll();
  }

  @Get("accounts/:id")
  @ApiOperation({ summary: "Get a bank account" })
  getAccount(@Param("id", ParseIntPipe) id: number) {
    return this.accounts.findOne(id);
  }

  @Patch("accounts/:id")
  @ApiOperation({ summary: "Update a bank account" })
  updateAccount(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.accounts.update(id, dto);
  }

  @Delete("accounts/:id")
  @ApiOperation({ summary: "Delete (soft) a bank account" })
  removeAccount(@Param("id", ParseIntPipe) id: number) {
    return this.accounts.remove(id);
  }

  // ─────────────── Bank transactions ───────────────

  @Post("transactions")
  @ApiOperation({ summary: "Create a single bank transaction" })
  createTransaction(@Body() dto: CreateBankTransactionDto) {
    return this.transactions.create(dto);
  }

  @Post("transactions/import")
  @ApiOperation({ summary: "Bulk import bank transactions" })
  importTransactions(@Body() dto: ImportBankTransactionsDto) {
    return this.transactions.import(dto);
  }

  @Get("transactions")
  @ApiOperation({ summary: "List bank transactions" })
  listTransactions(@Query() filters: BankTransactionFilterDto) {
    return this.transactions.findAll(filters);
  }

  @Get("transactions/:id")
  @ApiOperation({ summary: "Get a single bank transaction" })
  getTransaction(@Param("id", ParseIntPipe) id: number) {
    return this.transactions.findOne(id);
  }

  @Post("transactions/:id/match")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({
    summary: "Manually match a bank transaction to a Payment or SupplierPayment",
  })
  matchTransaction(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: MatchBankTransactionDto,
    @Req() req: Request,
  ) {
    const user = req["user"];
    return this.transactions.match(
      id,
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Post("transactions/:id/unmatch")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({ summary: "Reset a bank transaction back to UNMATCHED" })
  unmatchTransaction(@Param("id", ParseIntPipe) id: number) {
    return this.transactions.unmatch(id);
  }

  @Post("transactions/:id/ignore")
  @ApiOperation({
    summary: "Mark a bank transaction as IGNORED (bank fees, interest, …)",
  })
  ignoreTransaction(@Param("id", ParseIntPipe) id: number) {
    return this.transactions.ignore(id);
  }

  @Post("transactions/auto-match")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({
    summary:
      "Auto-match unmatched bank transactions to Payment / SupplierPayment rows",
  })
  autoMatch(
    @Query("bankAccountId") bankAccountId?: string,
    @Query("matchWindowDays") matchWindowDays?: string,
  ) {
    return this.transactions.autoMatch({
      bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
      matchWindowDays: matchWindowDays ? Number(matchWindowDays) : undefined,
    });
  }

  // ─────────────── Reconciliations ───────────────

  @Post("reconciliations")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({ summary: "Open a reconciliation period" })
  openReconciliation(
    @Body() dto: CreateReconciliationDto,
    @Req() req: Request,
  ) {
    const user = req["user"];
    return this.reconciliations.open(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get("reconciliations")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({ summary: "List reconciliations" })
  listReconciliations(@Query("bankAccountId") bankAccountId?: string) {
    return this.reconciliations.findAll(
      bankAccountId ? Number(bankAccountId) : undefined,
    );
  }

  @Get("reconciliations/:id")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({ summary: "Get a reconciliation" })
  getReconciliation(@Param("id", ParseIntPipe) id: number) {
    return this.reconciliations.findOne(id);
  }

  @Post("reconciliations/:id/close")
  @RequireFeature(FeatureCode.BANK_RECONCILIATION)
  @ApiOperation({
    summary:
      "Close a reconciliation period; rejects if book balance disagrees with statement closing balance",
  })
  closeReconciliation(@Param("id", ParseIntPipe) id: number) {
    return this.reconciliations.close(id);
  }
}
