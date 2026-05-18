-- MiningLicense: rename `address` -> `mineAddress` (preserve existing data).
ALTER TABLE "licenses" RENAME COLUMN "address" TO "mineAddress";

-- Contract: add required `mineAddress`. Backfill existing rows with a
-- temporary default, then drop the default so new rows must supply it.
ALTER TABLE "contracts" ADD COLUMN "mineAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "contracts" ALTER COLUMN "mineAddress" DROP DEFAULT;
