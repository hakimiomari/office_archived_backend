-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_parentId_fkey";

-- DropForeignKey
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_bankAccountId_fkey";

-- DropForeignKey
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_matchedPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_matchedSupplierPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_accountId_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "reconciliations" DROP CONSTRAINT "reconciliations_bankAccountId_fkey";

-- DropTable
DROP TABLE "accounts";

-- DropTable
DROP TABLE "bank_accounts";

-- DropTable
DROP TABLE "bank_transactions";

-- DropTable
DROP TABLE "journal_entries";

-- DropTable
DROP TABLE "journal_lines";

-- DropTable
DROP TABLE "reconciliations";

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "BankTransactionDirection";

-- DropEnum
DROP TYPE "BankTransactionStatus";

-- DropEnum
DROP TYPE "ReconciliationStatus";
