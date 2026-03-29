import type { Request, Response } from "express";
import { createHash } from "crypto";
import { getApiKeyByHash, insertRequestLog, touchApiKeyLastUsed, upsertUsageStat, checkRateLimit } from "./db";
import { analyzeError, detectProvider, type ErrorAnalysis } from "./llmAnalysis";
import { dispatchWebhook } from "./webhookEngine";
import { sendSlackAlert } from "./slackAlert";
import { getSlackIntegration } from "./db";

// ── Auto-Retry Helpers ────────────────────────────────────────────────────────

interface PayloadDiff {
  remove: string[];
  add: Record<string, unknown>;
  modify: Record<string, unknown>;
}

/** Check whether a payload diff contains any actual changes */
function hasDiffChanges(diff: PayloadDiff): boolean {
  return (
    diff.remove.length > 0 ||
    Object.keys(diff.add).length > 0 ||
    Object.keys(diff.modify).length > 0
  );
}

/**
 * Apply a suggested_payload_diff to a cloned request body.
 * Supports dot-notation keys for nested fields (e.g. "messages.0.role").
 */
export function applyPayloadDiff(body: unknown, diff: PayloadDiff): unknown {
  if (typeof body !== "object" || body === null) return body;
  const patched = JSON.parse(JSON.stringify(body));

  function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (typeof current[key] !== "object" || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]!] = value;
  }

  function deleteNested(obj: Record<string, unknown>, path: string): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (typeof current[key] !== "object" || current[key] === null) return;
      current = current[key] as Record<string, unknown>;
    }
    delete current[parts[parts.length - 1]!];
  }

  for (const key of diff.remove) {
    deleteNested(patched, key);
  }
  for (const [key, value] of Object.entries(diff.add)) {
    setNested(patched, key, value);
  }
  for (const [key, value] of Object.entries(diff.modify)) {
    setNested(patched, key, value);
  }

  return patched;
}

/** Build a SHA-256 hash of the raw API key for DB lookup */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Extract the raw key from the Authorization header (Bearer scheme) */
function extractBearerToken(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer") return parts[1] ?? null;
  return null;
}

export async function proxyHandler(req: Request, res: Response): Promise<void> {
  const start = Date.now();

  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const rawKey = extractBearerToken(req);
  if (!rawKey) {
    res.status(401).json({
      error: "Missing API key. Provide your SelfHeal key as: Authorization: Bearer gf_...",
    });
    return;
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = await getApiKeyByHash(keyHash);
  if (!apiKey) {
    res.status(401).json({ error: "Invalid or revoked API key." });
    return;
  }

  // ── 2. Rate limit check ──────────────────────────────────────────────────
  const { allowed, used, limit } = await checkRateLimit(apiKey.id, apiKey.tier);
  if (!allowed) {
    // Fire webhook asynchronously — don't block the response
    dispatchWebhook(apiKey.userId, "rate_limit", {
      api_key_id: apiKey.id,
      api_key_name: apiKey.name,
      tier: apiKey.tier,
      used,
      limit,
      destination_url: req.headers["x-destination-url"] ?? "unknown",
    }).catch(() => {});

    res.status(429).json({
      error: `Monthly request limit reached. Tier: ${apiKey.tier} (${limit} requests/month). Used: ${used}.`,
      upgrade_url: "https://selfheal.dev/pricing",
    });
    return;
  }

  // ── 3. Extract BYOLLM overrides (optional) ──────────────────────────────
  const llmOverrides = (() => {
    const customKey = req.headers["x-llm-api-key"] as string | undefined;
    const customModel = req.headers["x-llm-model"] as string | undefined;
    const customBaseUrl = req.headers["x-llm-base-url"] as string | undefined;
    if (!customKey && !customModel && !customBaseUrl) return undefined;
    return {
      ...(customKey && { apiKey: customKey }),
      ...(customModel && { model: customModel }),
      ...(customBaseUrl && { baseUrl: customBaseUrl }),
    };
  })();

  // ── 3b. Auto-retry preference (default: enabled) ────────────────────────
  const autoRetryHeader = (req.headers["x-auto-retry"] as string | undefined)?.toLowerCase();
  const autoRetryEnabled = autoRetryHeader !== "false" && autoRetryHeader !== "0";

  // ── 4. Validate destination ──────────────────────────────────────────────
  const destinationUrl = req.headers["x-destination-url"] as string | undefined;
  const destinationMethod = (req.headers["x-destination-method"] as string | undefined)?.toUpperCase() ?? "POST";

  if (!destinationUrl) {
    res.status(400).json({
      error: "Missing required header: X-Destination-URL. Provide the full URL of the target API.",
    });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(destinationUrl);
  } catch {
    res.status(400).json({ error: `Invalid X-Destination-URL: "${destinationUrl}" is not a valid URL.` });
    return;
  }

  // Block SSRF to internal/loopback addresses
  const hostname = parsedUrl.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local")
  ) {
    res.status(400).json({ error: "Requests to internal/loopback addresses are not allowed." });
    return;
  }

  // ── 5. Build forwarded headers ───────────────────────────────────────────
  const PROXY_HEADERS_TO_STRIP = new Set([
    "host",
    "x-destination-url",
    "x-destination-method",
    "x-llm-api-key",    // BYOLLM — never forward to destination
    "x-llm-model",      // BYOLLM
    "x-llm-base-url",   // BYOLLM
    "x-auto-retry",      // SelfHeal control header
    "authorization",     // strip our own auth key
    "content-length",    // will be recalculated
    "transfer-encoding",
    "connection",
  ]);

  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!PROXY_HEADERS_TO_STRIP.has(key.toLowerCase())) {
      forwardHeaders[key] = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }
  }

  // ── 5. Forward request ───────────────────────────────────────────────────
  let destStatusCode = 0;
  let destBody: unknown = null;
  let wasIntercepted = false;

  try {
    const bodyMethods = ["POST", "PUT", "PATCH"];
    const hasBody = bodyMethods.includes(destinationMethod) && req.body !== undefined;
    const bodyStr = hasBody ? JSON.stringify(req.body) : undefined;

    if (hasBody) {
      forwardHeaders["content-type"] = forwardHeaders["content-type"] ?? "application/json";
      forwardHeaders["content-length"] = String(Buffer.byteLength(bodyStr!));
    }

    const destResponse = await fetch(destinationUrl, {
      method: destinationMethod,
      headers: forwardHeaders,
      body: bodyStr,
    });

    destStatusCode = destResponse.status;
    const contentType = destResponse.headers.get("content-type") ?? "";
    const rawText = await destResponse.text();

    try {
      destBody = JSON.parse(rawText);
    } catch {
      destBody = rawText;
    }

    // ── 6. Pass-through on success ─────────────────────────────────────────
    if (destStatusCode >= 200 && destStatusCode < 400) {
      await touchApiKeyLastUsed(apiKey.id);
      await upsertUsageStat(apiKey.id, apiKey.userId, false);
      await insertRequestLog({
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        destinationUrl,
        method: destinationMethod,
        statusCode: destStatusCode,
        wasIntercepted: false,
        creditsUsed: 0,
        durationMs: Date.now() - start,
      });

      res.status(destStatusCode);
      if (contentType) res.setHeader("content-type", contentType);
      res.json(destBody);
      return;
    }

    // ── 7. Intercept error — invoke LLM ───────────────────────────────────
    wasIntercepted = true;
    const analysis = await analyzeError({
      destinationUrl,
      method: destinationMethod,
      requestHeaders: req.headers as Record<string, string>,
      requestBody: req.body,
      statusCode: destStatusCode,
      responseBody: destBody,
    }, llmOverrides);

    // ── 8. Auto-retry with fixed payload ──────────────────────────────────
    const diff = analysis.suggested_payload_diff as PayloadDiff;
    const shouldRetry =
      autoRetryEnabled &&
      analysis.is_retriable &&
      diff &&
      hasDiffChanges(diff) &&
      hasBody;

    let retryStatusCode: number | null = null;
    let retryBody: unknown = null;
    let retrySucceeded = false;
    let retryContentType = "";

    if (shouldRetry) {
      try {
        const patchedBody = applyPayloadDiff(req.body, diff);
        const patchedBodyStr = JSON.stringify(patchedBody);

        const retryHeaders = { ...forwardHeaders };
        retryHeaders["content-type"] = retryHeaders["content-type"] ?? "application/json";
        retryHeaders["content-length"] = String(Buffer.byteLength(patchedBodyStr));
        retryHeaders["x-selfheal-retry"] = "1";

        const retryResponse = await fetch(destinationUrl, {
          method: destinationMethod,
          headers: retryHeaders,
          body: patchedBodyStr,
        });

        retryStatusCode = retryResponse.status;
        retryContentType = retryResponse.headers.get("content-type") ?? "";
        const retryRawText = await retryResponse.text();

        try {
          retryBody = JSON.parse(retryRawText);
        } catch {
          retryBody = retryRawText;
        }

        retrySucceeded = retryStatusCode >= 200 && retryStatusCode < 400;
      } catch (retryErr) {
        console.error("[ProxyEngine] Auto-retry failed:", retryErr);
        // Retry network error — fall through to return original error
      }
    }

    const durationMs = Date.now() - start;
    await touchApiKeyLastUsed(apiKey.id);
    await upsertUsageStat(apiKey.id, apiKey.userId, true);
    await insertRequestLog({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      destinationUrl,
      method: destinationMethod,
      statusCode: destStatusCode,
      wasIntercepted: true,
      creditsUsed: 1,
      durationMs,
      errorSummary: analysis.human_readable_explanation.slice(0, 500),
      isRetriable: analysis.is_retriable,
      provider: analysis.provider,
      errorCategory: analysis.error_category,
      wasAutoRetried: shouldRetry,
      retrySucceeded: shouldRetry ? retrySucceeded : null,
      retryStatusCode,
    });

    // ── 9. Return auto-fixed success ──────────────────────────────────────
    if (retrySucceeded) {
      res.status(retryStatusCode!);
      if (retryContentType) res.setHeader("content-type", retryContentType);
      res.json({
        selfheal_auto_fixed: true,
        data: retryBody,
        original_error: {
          status_code: destStatusCode,
          error_analysis: analysis,
          raw_response: destBody,
        },
        applied_diff: diff,
        meta: {
          credits_used: 1,
          duration_ms: durationMs,
          tier: apiKey.tier,
          retry_status_code: retryStatusCode,
        },
      });
      return;
    }

    // ── 10. Fire alerts for non-retriable errors ──────────────────────────
    if (!analysis.is_retriable) {
      // Slack alert
      getSlackIntegration(apiKey.userId).then((slackConfig) => {
        if (slackConfig?.enabled && slackConfig.webhookUrl) {
          sendSlackAlert(slackConfig.webhookUrl, {
            destinationUrl,
            method: destinationMethod,
            statusCode: destStatusCode,
            errorCategory: analysis.error_category,
            explanation: analysis.human_readable_explanation,
            actionableFix: analysis.actionable_fix_for_agent,
            provider: analysis.provider,
            apiKeyName: apiKey.name,
            channel: slackConfig.channel,
          }).catch(() => {});
        }
      }).catch(() => {});

      dispatchWebhook(apiKey.userId, "non_retriable_error", {
        api_key_id: apiKey.id,
        api_key_name: apiKey.name,
        destination_url: destinationUrl,
        method: destinationMethod,
        status_code: destStatusCode,
        error_category: analysis.error_category,
        explanation: analysis.human_readable_explanation,
        actionable_fix: analysis.actionable_fix_for_agent,
      }).catch(() => {});
    }

    // ── 11. Return error envelope (retry failed or not attempted) ─────────
    res.status(destStatusCode).json({
      graceful_fail_intercepted: true,
      selfheal_auto_fixed: false,
      original_status_code: destStatusCode,
      destination_url: destinationUrl,
      detected_provider: analysis.provider ?? "other",
      error_analysis: analysis,
      raw_destination_response: destBody,
      ...(shouldRetry && retryStatusCode !== null
        ? {
            retry_attempted: true,
            retry_status_code: retryStatusCode,
            retry_response: retryBody,
          }
        : {}),
      meta: {
        credits_used: 1,
        duration_ms: durationMs,
        tier: apiKey.tier,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error("[ProxyEngine] Unexpected error:", err);

    if (destStatusCode > 0) {
      // We got a response but something failed in our processing
      await insertRequestLog({
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        destinationUrl,
        method: destinationMethod,
        statusCode: destStatusCode,
        wasIntercepted,
        creditsUsed: wasIntercepted ? 1 : 0,
        durationMs,
        errorSummary: "Internal proxy error during analysis",
      }).catch(() => {});
    }

    res.status(502).json({
      error: "Proxy encountered an unexpected error. Please try again.",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
