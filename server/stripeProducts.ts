/**
 * SelfHeal — Stripe Products & Prices
 * These are the Stripe Price IDs for each paid tier.
 * In test mode, prices are created dynamically via checkout.
 */

export const STRIPE_PRODUCTS = {
  pro: {
    name: "SelfHeal Pro",
    description: "10,000 proxied requests/month with LLM error analysis",
    priceUsd: 2900, // $29.00 in cents
    tier: "pro" as const,
  },
  agency: {
    name: "SelfHeal Agency",
    description: "50,000 proxied requests/month with priority support",
    priceUsd: 9900, // $99.00 in cents
    tier: "agency" as const,
  },
} as const;

export type StripeTier = keyof typeof STRIPE_PRODUCTS;
