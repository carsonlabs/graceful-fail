import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "crypto";
import { billingRouter } from "./stripeRouter";
import { webhooksRouter } from "./webhookRouter";
import { z } from "zod";
import {
  createApiKey,
  getDashboardStats,
  getApiKeysByUserId,
  getRequestLogsByUserId,
  getRequestLogCount,
  getUsageStatsByUserId,
  revokeApiKey,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = "gf_" + randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 11); // "gf_" + 8 chars
  return { raw, hash, prefix };
}

const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getApiKeysByUserId(ctx.user.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        tier: z.enum(["hobby", "pro", "agency"]).default("hobby"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { raw, hash, prefix } = generateApiKey();
      await createApiKey({
        userId: ctx.user.id,
        name: input.name,
        keyPrefix: prefix,
        keyHash: hash,
        tier: input.tier,
      });
      // Return the raw key ONCE — it will never be shown again
      return { rawKey: raw, prefix, name: input.name, tier: input.tier };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await revokeApiKey(input.id, ctx.user.id);
      return { success: true };
    }),
});

const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getDashboardStats(ctx.user.id);
  }),

  requestLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        interceptedOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const [logs, total] = await Promise.all([
        getRequestLogsByUserId(ctx.user.id, input.limit, input.offset, input.interceptedOnly),
        getRequestLogCount(ctx.user.id, input.interceptedOnly),
      ]);
      return { logs, total };
    }),

  usageHistory: protectedProcedure.query(async ({ ctx }) => {
    return getUsageStatsByUserId(ctx.user.id);
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  apiKeys: apiKeysRouter,
  dashboard: dashboardRouter,
  billing: billingRouter,
  webhooks: webhooksRouter,
});

export type AppRouter = typeof appRouter;
