import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { sentryIntegrations } from "../drizzle/schema";

export const sentryRouter = router({
  /** Get the current user's Sentry integration config */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(sentryIntegrations)
      .where(eq(sentryIntegrations.userId, ctx.user.id))
      .limit(1);
    if (rows.length === 0) return null;
    // Don't expose the full secret — show only the prefix
    const row = rows[0]!;
    return {
      id: row.id,
      webhookSecretPrefix: row.webhookSecret.slice(0, 12) + "...",
      projectSlug: row.projectSlug,
      enabled: row.enabled,
      createdAt: row.createdAt,
      webhookUrl: `https://selfheal.dev/api/webhooks/sentry`,
    };
  }),

  /** Create or regenerate a Sentry integration */
  setup: protectedProcedure
    .input(
      z.object({
        projectSlug: z.string().max(128).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const secret = `shsec_${nanoid(32)}`;

      // Upsert — delete existing then insert
      await db
        .delete(sentryIntegrations)
        .where(eq(sentryIntegrations.userId, ctx.user.id));

      await db.insert(sentryIntegrations).values({
        userId: ctx.user.id,
        webhookSecret: secret,
        projectSlug: input.projectSlug ?? null,
        enabled: true,
      });

      // Return the secret once — it won't be shown again in full
      return {
        webhookSecret: secret,
        webhookUrl: `https://selfheal.dev/api/webhooks/sentry`,
      };
    }),

  /** Toggle the integration on/off */
  toggle: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(sentryIntegrations)
        .set({ enabled: input.enabled })
        .where(eq(sentryIntegrations.userId, ctx.user.id));

      return { success: true };
    }),

  /** Delete the Sentry integration */
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    await db
      .delete(sentryIntegrations)
      .where(eq(sentryIntegrations.userId, ctx.user.id));

    return { success: true };
  }),
});
