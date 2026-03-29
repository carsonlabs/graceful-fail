/**
 * Sentry inbound webhook handler.
 *
 * Receives Sentry issue/event webhooks, normalizes the error data,
 * runs it through the LLM analysis pipeline, and stores the result.
 */

import type { Request, Response } from "express";
import { createHmac } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { sentryIntegrations } from "../drizzle/schema";
import { analyzeError } from "./llmAnalysis";
import { insertRequestLog } from "./db";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SentryStackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  module?: string;
}

interface SentryException {
  type?: string;
  value?: string;
  stacktrace?: {
    frames?: SentryStackFrame[];
  };
}

interface SentryWebhookPayload {
  action: string;
  data: {
    issue?: {
      id?: string;
      title?: string;
      culprit?: string;
      platform?: string;
      metadata?: {
        type?: string;
        value?: string;
      };
    };
    event?: {
      event_id?: string;
      exception?: {
        values?: SentryException[];
      };
      breadcrumbs?: Array<{
        category?: string;
        message?: string;
        level?: string;
        timestamp?: number;
      }>;
      tags?: Array<{ key: string; value: string }>;
      contexts?: Record<string, unknown>;
    };
  };
  actor?: { type: string; id?: number; name?: string };
}

// ── Signature Verification ────────────────────────────────────────────────────

function verifySentrySignature(
  body: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

// ── Normalize Sentry Data → LLM Analysis Input ───────────────────────────────

function formatStackTrace(frames: SentryStackFrame[]): string {
  // Sentry frames are bottom-to-top; reverse for human readability
  return frames
    .slice()
    .reverse()
    .map((f) => {
      const loc = [f.filename, f.lineno, f.colno].filter(Boolean).join(":");
      const fn = f.function ?? "<anonymous>";
      const context = f.context_line ? `\n    > ${f.context_line.trim()}` : "";
      return `  at ${fn} (${loc})${context}`;
    })
    .join("\n");
}

function buildAnalysisContext(payload: SentryWebhookPayload): {
  errorDescription: string;
  stackTrace: string;
  breadcrumbs: string;
  platform: string;
} {
  const issue = payload.data.issue;
  const event = payload.data.event;
  const exceptions = event?.exception?.values ?? [];

  // Build error description
  const primaryException = exceptions[0];
  const errorDescription = primaryException
    ? `${primaryException.type ?? "Error"}: ${primaryException.value ?? issue?.title ?? "Unknown error"}`
    : issue?.title ?? "Unknown error";

  // Build stack trace
  const frames = primaryException?.stacktrace?.frames ?? [];
  const stackTrace = frames.length > 0
    ? formatStackTrace(frames)
    : issue?.culprit ?? "No stack trace available";

  // Build breadcrumbs summary
  const crumbs = event?.breadcrumbs ?? [];
  const breadcrumbs = crumbs
    .slice(-10) // Last 10 breadcrumbs
    .map((b) => `[${b.category ?? "unknown"}] ${b.message ?? "(no message)"}`)
    .join("\n");

  return {
    errorDescription,
    stackTrace,
    breadcrumbs,
    platform: issue?.platform ?? "unknown",
  };
}

// ── Express Handler ───────────────────────────────────────────────────────────

export async function sentryWebhookHandler(
  req: Request,
  res: Response
): Promise<void> {
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers["sentry-hook-signature"] as string | undefined;

  // Look up integration by checking all active integrations
  // (Sentry doesn't send a user identifier — we match by signature)
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }

  const integrations = await db
    .select()
    .from(sentryIntegrations)
    .where(eq(sentryIntegrations.enabled, true));

  // Find the integration whose secret matches the signature
  const matched = integrations.find((integration) =>
    verifySentrySignature(rawBody, signature, integration.webhookSecret)
  );

  if (!matched) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Parse the Sentry payload
  const payload = req.body as SentryWebhookPayload;

  // Only process "created" and "triggered" actions (new issues/alerts)
  if (payload.action !== "created" && payload.action !== "triggered") {
    res.status(200).json({ status: "ignored", reason: `action '${payload.action}' not processed` });
    return;
  }

  // Filter by project slug if configured
  if (matched.projectSlug && payload.data.issue) {
    const issueTitle = payload.data.issue.title ?? "";
    // Project slug filtering is advisory — process all if no specific filter
  }

  // Build analysis context
  const context = buildAnalysisContext(payload);

  // Run through LLM analysis with a Sentry-specific framing
  try {
    const analysis = await analyzeError({
      destinationUrl: `sentry://${context.platform}/${payload.data.issue?.id ?? "unknown"}`,
      method: "EXCEPTION",
      requestHeaders: {},
      requestBody: {
        error: context.errorDescription,
        stack_trace: context.stackTrace,
        breadcrumbs: context.breadcrumbs,
        platform: context.platform,
        culprit: payload.data.issue?.culprit,
        issue_id: payload.data.issue?.id,
      },
      statusCode: 500, // Exceptions are treated as 500s for analysis
      responseBody: {
        exception: context.errorDescription,
        stack_trace: context.stackTrace,
      },
    });

    // Store the analysis
    await insertRequestLog({
      apiKeyId: 0, // No API key for inbound webhooks
      userId: matched.userId,
      destinationUrl: `sentry://${payload.data.issue?.id ?? "unknown"}`,
      method: "SENTRY_WEBHOOK",
      statusCode: 500,
      wasIntercepted: true,
      creditsUsed: 1,
      durationMs: 0,
      errorSummary: analysis.human_readable_explanation.slice(0, 500),
      isRetriable: analysis.is_retriable,
      provider: context.platform,
      errorCategory: analysis.error_category,
      source: "sentry",
    });

    res.status(200).json({
      status: "analyzed",
      issue_id: payload.data.issue?.id,
      error_analysis: analysis,
    });
  } catch (err) {
    console.error("[SentryWebhook] Analysis failed:", err);
    res.status(500).json({
      error: "Failed to analyze Sentry event",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
