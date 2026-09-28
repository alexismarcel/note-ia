import Stripe from "stripe";

// Server-side only: STRIPE_SECRET_KEY must never reach the browser, which is
// why this module has no NEXT_PUBLIC_ counterpart and is imported by route
// handlers alone.
export function createStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  // No apiVersion pin: the SDK sends the version it was built against
  // (2026-08-26.dahlia for stripe 22.x), so the two can never drift apart.
  return new Stripe(key);
}

// The weekly subscription. Kept here rather than inline so the checkout route
// and anything that later reads a webhook agree on which price is "the" plan.
export const WEEKLY_PRICE_ID = "price_1UKhmVG67S73RdxuOLTBSrqd";

// Stripe's own statuses. "active" and "trialing" are the two that mean the
// user may use what they paid for; the rest are degrees of not.
export const ENTITLING_STATUSES = ["active", "trialing"] as const;

export function isEntitled(status: string | null | undefined): boolean {
  return (
    status != null &&
    (ENTITLING_STATUSES as readonly string[]).includes(status)
  );
}
