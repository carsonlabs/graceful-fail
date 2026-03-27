import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { webhookEndpoints, webhookDeliveries } from "../drizzle/schema";
import { dispatchWebhook } from "./webhookEngine";

const WEBHOOK_EVENTS = ["all", "rate_limit", "non_retriable_error"] as const;

export const webhooksRouter = router({
  /** List all webhook endpoints for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, ctx.user.id))
      .orderBy(desc(webhookEndpoints.createdAt));
  }),

  /** Create a new webhook endpoint */
  create: protectedProcedure
    .input(
      z.object({
        url: z.string().url("Must be a valid URL"),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).default(["all"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const secret = `whsec_${nanoid(32)}`;

      await db.insert(webhookEndpoints).values({
        userId: ctx.user.id,
        url: input.url,
        secret,
        events: JSON.stringify(input.events),
        isActive: true,
      });

      // Return the secret once — it won't be shown again in full
      return { secret };
    }),

  /** Delete a webhook endpoint */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, input.id),
            eq(webhookEndpoints.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  /** Toggle active/inactive state */
  toggle: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(webhookEndpoints)
        .set({ isActive: input.isActive })
        .where(
          and(
            eq(webhookEndpoints.id, input.id),
            eq(webhookEndpoints.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  /** Send a test ping to a webhook endpoint */
  test: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, input.id),
            eq(webhookEndpoints.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!rows[0]) throw new Error("Webhook endpoint not found");

      await dispatchWebhook(ctx.user.id, "all", {
        test: true,
        message: "This is a test event from SelfHeal",
        endpoint_id: input.id,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    }),

  /** Get recent delivery logs for an endpoint */
  deliveries: protectedProcedure
    .input(z.object({ endpointId: z.number().int().positive(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership
      const ep = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, input.endpointId),
            eq(webhookEndpoints.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!ep[0]) return [];

      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, input.endpointId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(input.limit);
    }),
});
