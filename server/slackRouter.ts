import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getSlackIntegration, upsertSlackIntegration, deleteSlackIntegration } from "./db";
import { sendSlackTestMessage } from "./slackAlert";

export const slackRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    return getSlackIntegration(ctx.user.id);
  }),

  save: protectedProcedure
    .input(
      z.object({
        webhookUrl: z.string().url().startsWith("https://hooks.slack.com/", {
          message: "Must be a valid Slack Incoming Webhook URL (https://hooks.slack.com/...)",
        }),
        channel: z.string().max(128).optional().nullable(),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertSlackIntegration(ctx.user.id, {
        webhookUrl: input.webhookUrl,
        channel: input.channel ?? null,
        enabled: input.enabled,
      });
      return { success: true };
    }),

  test: protectedProcedure.mutation(async ({ ctx }) => {
    const config = await getSlackIntegration(ctx.user.id);
    if (!config) {
      return { ok: false, message: "No Slack webhook configured. Save a webhook URL first." };
    }
    const result = await sendSlackTestMessage(config.webhookUrl, config.channel);
    return {
      ok: result.ok,
      statusCode: result.statusCode,
      message: result.ok
        ? "Test message sent! Check your Slack channel."
        : `Slack returned HTTP ${result.statusCode ?? "error"}. Verify the webhook URL is still valid.`,
    };
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteSlackIntegration(ctx.user.id);
    return { success: true };
  }),

  toggle: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const config = await getSlackIntegration(ctx.user.id);
      if (!config) throw new Error("No Slack integration configured");
      await upsertSlackIntegration(ctx.user.id, {
        webhookUrl: config.webhookUrl,
        channel: config.channel,
        enabled: input.enabled,
      });
      return { success: true };
    }),
});
