import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "crypto";
import { billingRouter } from "./stripeRouter";
import { webhooksRouter } from "./webhookRouter";
import { referralRouter } from "./referralRouter";
import { slackRouter } from "./slackRouter";
import { sentryRouter } from "./sentryRouter";
import { z } from "zod";
import {
  createApiKey,
  getDashboardStats,
  getApiKeysByUserId,
  getRequestLogsByUserId,
  getRequestLogCount,
  getUsageStatsByUserId,
  revokeApiKey,
  renameApiKey,
  getPublicStatus,
  getOnboardingStatus,
  dismissOnboarding,
  getAllRequestLogsForUser,
  getApiLeaderboard,
  getWeeklyDigestData,
  setWeeklyDigestEnabled,
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

  rename: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await renameApiKey(input.id, ctx.user.id, input.name);
      return { success: true };
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

  onboarding: protectedProcedure.query(async ({ ctx }) => {
    return getOnboardingStatus(ctx.user.id);
  }),

  dismissOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await dismissOnboarding(ctx.user.id);
    return { success: true };
  }),

  exportLogs: protectedProcedure
    .input(z.object({ interceptedOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const logs = await getAllRequestLogsForUser(ctx.user.id, input.interceptedOnly);
      // Build CSV string server-side
      const header = "id,method,destinationUrl,statusCode,wasIntercepted,creditsUsed,durationMs,isRetriable,errorSummary,createdAt";
      const rows = logs.map((l) =>
        [
          l.id,
          l.method,
          `"${l.destinationUrl.replace(/"/g, '""')}"`,
          l.statusCode,
          l.wasIntercepted ? 1 : 0,
          l.creditsUsed,
          l.durationMs,
          l.isRetriable === null ? "" : l.isRetriable ? 1 : 0,
          l.errorSummary ? `"${l.errorSummary.replace(/"/g, '""')}"` : "",
          l.createdAt.toISOString(),
        ].join(",")
      );
      return { csv: [header, ...rows].join("\n"), count: logs.length };
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
  referrals: referralRouter,
  slack: slackRouter,
  sentry: sentryRouter,
  playground: router({
    webhookDryRun: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
          payload: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const startMs = Date.now();
        const body = input.payload ?? JSON.stringify({
          event: "non_retriable_error",
          timestamp: new Date().toISOString(),
          data: {
            request_id: "dry_run_" + Math.random().toString(36).slice(2, 10),
            destination_url: "https://api.example.com/endpoint",
            method: "POST",
            status_code: 422,
            error_category: "validation_error",
            is_retriable: false,
            actionable_fix_for_agent: "This is a dry-run test payload from SelfHeal Playground.",
          },
        });

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(input.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Graceful-Fail-Dry-Run": "true",
              "User-Agent": "GracefulFail-Playground/1.0",
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const responseMs = Date.now() - startMs;
          let responseBody = "";
          try { responseBody = await res.text(); } catch { responseBody = "(could not read body)"; }
          return {
            success: true,
            statusCode: res.status,
            statusText: res.statusText,
            responseMs,
            responseBody: responseBody.slice(0, 2000),
            payloadSent: body,
          };
        } catch (err: unknown) {
          const responseMs = Date.now() - startMs;
          const message = err instanceof Error ? err.message : "Unknown error";
          return {
            success: false,
            statusCode: 0,
            statusText: "Connection failed",
            responseMs,
            responseBody: message,
            payloadSent: body,
          };
        }
      }),
  }),
  status: router({
    get: publicProcedure.query(async () => getPublicStatus()),
    leaderboard: publicProcedure.query(async () => getApiLeaderboard()),
  }),
  digest: router({
    getPreference: protectedProcedure.query(async ({ ctx }) => {
      const data = await getWeeklyDigestData(ctx.user.id);
      return { enabled: data !== null };
    }),
    setEnabled: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await setWeeklyDigestEnabled(ctx.user.id, input.enabled);
        return { success: true };
      }),
    sendNow: protectedProcedure.mutation(async ({ ctx }) => {
      const data = await getWeeklyDigestData(ctx.user.id);
      if (!data) return { sent: false, reason: "Digest is disabled or no data available" };
      // Use notifyOwner as the email channel (owner-only for now, full email in production)
      const { notifyOwner } = await import("./_core/notification");
      const topApisText = data.topFailingApis.length > 0
        ? data.topFailingApis.map((a, i) => `${i + 1}. ${a.domain} (${a.count} failures)`).join("\n")
        : "No failed requests this week — great job!";
      await notifyOwner({
        title: `📊 Your SelfHeal Weekly Digest`,
        content: `Hi ${data.userName},\n\nHere's your weekly summary:\n\n` +
          `• Total requests: ${data.totalRequests}\n` +
          `• Errors intercepted: ${data.interceptedRequests}\n` +
          `• Success rate: ${data.successRate}%\n` +
          `• Credits used: ${data.creditsUsed}\n\n` +
          `Top failing APIs this week:\n${topApisText}\n\n` +
          `View full logs: https://selfheal.dev/dashboard/logs`,
      });
      return { sent: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
