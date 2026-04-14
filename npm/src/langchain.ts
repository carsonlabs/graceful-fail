/**
 * LangChain.js integration for Graceful Fail.
 *
 * Provides a Tool that routes HTTP calls through the proxy,
 * returning structured fix instructions on errors.
 *
 * @example x402 mode (default)
 * ```ts
 * import { GracefulFailTool } from "graceful-fail/langchain";
 *
 * const tool = new GracefulFailTool();
 * // Add to your agent's tool list — no API key needed
 * ```
 *
 * @example Legacy mode
 * ```ts
 * const tool = new GracefulFailTool({ apiKey: "gf_your_key" });
 * ```
 */
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { GracefulFail } from "./client.js";
import type { GracefulFailResponse } from "./types.js";

const inputSchema = z.object({
  url: z.string().describe("The full URL of the API endpoint to call"),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .default("GET")
    .describe("HTTP method to use"),
  body: z
    .string()
    .optional()
    .describe("JSON request body as a string (for POST, PUT, PATCH)"),
  headers: z
    .string()
    .optional()
    .describe("Additional headers as a JSON string, e.g. '{\"X-Custom\": \"value\"}'"),
});

function formatResponse(resp: GracefulFailResponse): string {
  // x402 healed
  if (resp.healed && resp.errorAnalysis) {
    const ea = resp.errorAnalysis;
    const parts = [
      `HEALED via x402 (HTTP ${resp.statusCode}, category: ${ea.error_category})`,
      `Explanation: ${ea.human_readable_explanation}`,
      `Fix: ${ea.actionable_fix_for_agent}`,
    ];
    if (resp.settled) parts.push(`Payment settled. TX: ${resp.txHash ?? "pending"}`);
    return parts.join("\n");
  }

  // x402 payment required (no callback provided)
  if (resp.paymentRequired) {
    const accept = resp.paymentRequired.accepts[0];
    return [
      `PAYMENT REQUIRED (x402)`,
      `Error: ${resp.paymentRequired.error}`,
      `Price: ${accept?.maxAmountRequired ?? "?"} atomic USDC on ${accept?.network ?? "base"}`,
      `Pay to: ${accept?.payTo ?? "?"}`,
    ].join("\n");
  }

  // Legacy auto-fixed
  if (resp.autoFixed && resp.errorAnalysis) {
    const ea = resp.errorAnalysis;
    const parts = [
      `AUTO-FIXED (original error: HTTP ${ea.error_category})`,
      `SelfHeal automatically corrected the request and retried successfully.`,
      `What was wrong: ${ea.human_readable_explanation}`,
      `What was changed: ${JSON.stringify(resp.appliedDiff)}`,
      `Result (HTTP ${resp.statusCode}):`,
      typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data, null, 2),
    ];
    return parts.join("\n");
  }

  // Legacy intercepted
  if (resp.intercepted && resp.errorAnalysis) {
    const ea = resp.errorAnalysis;
    const parts = [
      `API ERROR (HTTP ${resp.statusCode}, category: ${ea.error_category})`,
      `Retriable: ${ea.is_retriable}`,
      `Explanation: ${ea.human_readable_explanation}`,
      `Fix: ${ea.actionable_fix_for_agent}`,
    ];
    const diff = ea.suggested_payload_diff;
    if (diff.remove.length > 0) parts.push(`Remove fields: ${JSON.stringify(diff.remove)}`);
    if (Object.keys(diff.add).length > 0) parts.push(`Add fields: ${JSON.stringify(diff.add)}`);
    if (Object.keys(diff.modify).length > 0) parts.push(`Modify fields: ${JSON.stringify(diff.modify)}`);
    return parts.join("\n");
  }

  return typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data, null, 2);
}

export interface GracefulFailToolOptions {
  /** Your Graceful Fail API key. Omit for x402 mode (recommended). */
  apiKey?: string;
  /** Base URL of the proxy. Defaults to https://selfheal.dev */
  baseUrl?: string;
  /** x402 payment callback. Return payment proof string or null. */
  onPaymentRequired?: (info: any) => Promise<string | null>;
}

/**
 * LangChain tool that makes HTTP requests through Graceful Fail.
 *
 * When an API returns an error, instead of a raw HTTP error,
 * the agent gets structured fix instructions.
 */
export class GracefulFailTool extends StructuredTool {
  name = "graceful_fail_http";
  description =
    "Make an HTTP request to any API through the SelfHeal proxy. " +
    "If the API returns an error (4xx/5xx), you will receive structured " +
    "fix instructions explaining exactly what went wrong and how to " +
    "correct your request. Successes are free. Errors cost $0.001-$0.005 USDC via x402.";
  schema = inputSchema;

  private client: GracefulFail;

  constructor(options: GracefulFailToolOptions = {}) {
    super();
    this.client = new GracefulFail({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      onPaymentRequired: options.onPaymentRequired,
    });
  }

  async _call(input: z.infer<typeof inputSchema>): Promise<string> {
    const { url, method, body, headers: headersStr } = input;

    let parsedHeaders: Record<string, string> | undefined;
    if (headersStr) {
      try {
        parsedHeaders = JSON.parse(headersStr);
      } catch {
        return "Error: headers must be a valid JSON string";
      }
    }

    let parsedBody: unknown;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        return "Error: body must be a valid JSON string";
      }
    }

    try {
      const resp = await this.client.request(method, url, {
        json: parsedBody,
        headers: parsedHeaders,
      });
      return formatResponse(resp);
    } catch (err) {
      return `Proxy error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
