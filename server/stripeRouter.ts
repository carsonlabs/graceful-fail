import Stripe from "stripe";
import express from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { subscriptions, apiKeys } from "../drizzle/schema";
import { STRIPE_PRODUCTS, type StripeTier } from "./stripeProducts";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// ── tRPC billing router ──────────────────────────────────────────────────────

export const billingRouter = router({
  /** Get the current user's subscription status */
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);
    return rows[0] ?? null;
  }),

  /** Create a Stripe Checkout Session and return the URL */
  createCheckout: protectedProcedure
    .input(z.object({ tier: z.enum(["pro", "agency"]), origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const product = STRIPE_PRODUCTS[input.tier as StripeTier];

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        allow_promotion_codes: true,
        customer_email: ctx.user.email ?? undefined,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
          tier: input.tier,
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: product.name,
                description: product.description,
              },
              unit_amount: product.priceUsd,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        success_url: `${input.origin}/dashboard?upgrade=success`,
        cancel_url: `${input.origin}/dashboard/billing`,
      });

      return { checkoutUrl: session.url };
    }),

  /** Create a Stripe Customer Portal session for managing/canceling subscriptions */
  createPortal: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .limit(1);

      const sub = rows[0];
      if (!sub?.stripeCustomerId) throw new Error("No active subscription found");

      const session = await getStripe().billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${input.origin}/dashboard/billing`,
      });

      return { portalUrl: session.url };
    }),
});

// ── Express webhook handler ──────────────────────────────────────────────────

export function registerStripeWebhook(app: express.Application) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event;

      try {
        event = getStripe().webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!
        );
      } catch (err) {
        console.error("[Stripe Webhook] Signature verification failed:", err);
        return res.status(400).json({ error: "Invalid signature" });
      }

      // Test event passthrough
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Received: ${event.type} (${event.id})`);

      try {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = parseInt(session.metadata?.user_id ?? "0");
            const tier = (session.metadata?.tier ?? "hobby") as "hobby" | "pro" | "agency";
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;

            if (!userId) break;

            // Upsert subscription record
            await db
              .insert(subscriptions)
              .values({
                userId,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                tier,
                status: "active",
              })
              .onDuplicateKeyUpdate({
                set: {
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscriptionId,
                  tier,
                  status: "active",
                },
              });

            // Upgrade all active API keys for this user to the new tier
            await db
              .update(apiKeys)
              .set({ tier })
              .where(eq(apiKeys.userId, userId));

            console.log(`[Stripe] Upgraded user ${userId} to ${tier}`);
            break;
          }

          case "customer.subscription.updated": {
            const sub = event.data.object as Stripe.Subscription;
            const customerId = sub.customer as string;

            const rows = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.stripeCustomerId, customerId))
              .limit(1);

            if (!rows[0]) break;

            const newStatus = sub.status;
            // `current_period_end` is a top-level Stripe Subscription field (Unix timestamp).
            // Cast through unknown to avoid SDK version type drift without using `any`.
            const rawPeriodEnd = (sub as unknown as Record<string, unknown>)["current_period_end"];
            const periodEnd = typeof rawPeriodEnd === "number" && rawPeriodEnd > 0
              ? new Date(rawPeriodEnd * 1000)
              : undefined;

            await db
              .update(subscriptions)
              .set({ status: newStatus, currentPeriodEnd: periodEnd })
              .where(eq(subscriptions.stripeCustomerId, customerId));

            // Downgrade keys if subscription is canceled or past due
            if (newStatus === "canceled" || newStatus === "past_due") {
              await db
                .update(apiKeys)
                .set({ tier: "hobby" })
                .where(eq(apiKeys.userId, rows[0].userId));
            }
            break;
          }

          case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            const customerId = sub.customer as string;

            const rows = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.stripeCustomerId, customerId))
              .limit(1);

            if (!rows[0]) break;

            await db
              .update(subscriptions)
              .set({ status: "canceled", tier: "hobby" })
              .where(eq(subscriptions.stripeCustomerId, customerId));

            await db
              .update(apiKeys)
              .set({ tier: "hobby" })
              .where(eq(apiKeys.userId, rows[0].userId));

            console.log(`[Stripe] Downgraded user ${rows[0].userId} to hobby (subscription canceled)`);
            break;
          }
        }

        res.json({ received: true });
      } catch (err) {
        console.error("[Stripe Webhook] Processing error:", err);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );
}
