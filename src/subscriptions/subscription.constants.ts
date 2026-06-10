/**
 * Subscription layer — shared constants.
 *
 * Cache TTL is short on purpose: an admin upgrading a tenant should see
 * effects within the second cache window even if the explicit
 * `invalidateForCompany()` call is somehow missed.
 */

export const PLAN_SLUGS = {
  BASIC: "basic",
  PREMIUM: "premium",
  PRO: "pro",
} as const;

export const SUBSCRIPTION_CACHE_TTL_SECONDS = 60;

export const SUBSCRIPTION_CACHE_KEY = (companyId: number) =>
  `sub:company:${companyId}`;

/**
 * Set `SUBSCRIPTION_ENFORCE=1` in env to actually throw 403s from the
 * subscription guards + limit checks. Anything else (unset, "0",
 * "warn") keeps the guards in warn-only mode: they log what they
 * would have blocked but allow the request through.
 *
 * This lets the layer ship safely — production observers can confirm
 * no critical flow is mis-gated before flipping the switch.
 */
export function isSubscriptionEnforced(): boolean {
  return process.env.SUBSCRIPTION_ENFORCE === "1";
}

/** Decorator metadata keys. Kept here so guards + decorators agree. */
export const REQUIRE_MODULE_KEY = "subscription:require_module";
export const REQUIRE_FEATURE_KEY = "subscription:require_feature";
