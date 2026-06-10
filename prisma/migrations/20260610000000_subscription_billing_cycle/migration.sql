-- BillingCycle enum + per-subscription column. Existing rows default
-- to PERPETUAL (preserves their current open-ended behaviour — every
-- backfilled / auto-assigned Basic row stays unchanged).

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'PERPETUAL');

ALTER TABLE "company_subscriptions"
  ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'PERPETUAL';
