-- DropIndex
DROP INDEX "users_googleId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "googleId",
ALTER COLUMN "password" SET NOT NULL;
