import { AuthenticationError, ProxyError, RateLimitError } from "./errors.js";
import type {
  AutoFixedEnvelope,
  GracefulFailOptions,
  GracefulFailResponse,
  InterceptedEnvelope,
  RequestOptions,
  X402HealedResponse,
  X402PaymentRequired,
} from "./types.js";

const DEFAULT_BASE_URL = "https://selfheal.dev";
const DEFAULT_TIMEOUT = 30_000;

/**
 * Graceful Fail client for Node.js and the browser.
 *
 * Supports two modes:
 * - **x402 mode** (default): No API key needed. Uses `/api/x402/proxy`.
 *   Successes are free. Failures return 402 → agent pays → gets heal.
 * - **Legacy mode**: Pass `apiKey` to use `/api/proxy` with API key auth.
 *
 * @example x402 mode (recommended)
 * ```ts
 * import { GracefulFail } from "graceful-fail";
 *
 * const gf = new GracefulFail({
 *   onPaymentRequired: async (info) => {
 *     // Your x402 payment logic here
 *     return paymentProof;
 *   },
 * });
 *
 * const resp = await gf.post("https://api.example.com/users", {
 *   json: { name: "Alice" },
 * });
 *
 * if (resp.healed) {
 *   console.log("Fix:", resp.errorAnalysis!.actionable_fix_for_agent);
 * } else {
 *   console.log("Success:", resp.data);
 * }
 * ```
 *
 * @example Legacy mode (API key)
 * ```ts
 * const gf = new GracefulFail({ apiKey: "gf_your_key" });
 * const resp = await gf.post(url, { json: payload });
 * ```
 */
export class GracefulFail {
  private apiKey?: string;
  private baseUrl: string;
  private timeout: number;
  private autoRetry: boolean;
  private onPaymentRequired?: (info: X402PaymentRequired) => Promise<string | null>;
  private llmHeaders: Record<string, string>;

  constructor(options: GracefulFailOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.autoRetry = options.autoRetry ?? true;
    this.onPaymentRequired = options.onPaymentRequired;
    this.llmHeaders = {};
    if (options.llmApiKey) this.llmHeaders["X-LLM-API-Key"] = options.llmApiKey;
    if (options.llmModel) this.llmHeaders["X-LLM-Model"] = options.llmModel;
    if (options.llmBaseUrl) this.llmHeaders["X-LLM-Base-URL"] = options.llmBaseUrl;
  }

  private get isX402Mode(): boolean {
    return !this.apiKey;
  }

  /**
   * Send a request through the Graceful Fail proxy.
   */
  async request<T = unknown>(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Promise<GracefulFailResponse<T>> {
    if (this.isX402Mode) {
      return this.requestX402<T>(method, url, options);
    }
    return this.requestLegacy<T>(method, url, options);
  }

  // ── x402 mode ──────────────────────────────────────────────────────────

  private async requestX402<T>(
    method: string,
    url: string,
    options: RequestOptions,
  ): Promise<GracefulFailResponse<T>> {
    let bodyStr: string | undefined;
    if (options.json !== undefined) {
      bodyStr = JSON.stringify(options.json);
    } else if (options.body !== undefined) {
      bodyStr = options.body;
    }

    const proxyBody = JSON.stringify({
      url,
      method: method.toUpperCase(),
      headers: options.headers,
      body: bodyStr,
      ...(options.targetSchema ? { target_schema: options.targetSchema } : {}),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/x402/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: proxyBody,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ProxyError(
        `Failed to reach SelfHeal proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    // Success pass-through (free)
    if (response.ok) {
      const body = await response.json();
      // x402 healed response
      if (body && typeof body === "object" && "healed" in body && body.healed) {
        const healed = body as X402HealedResponse;
        return {
          statusCode: healed.original_status_code,
          intercepted: true,
          autoFixed: false,
          healed: true,
          data: body as T,
          errorAnalysis: healed.error_analysis,
          rawResponse: healed.raw_destination_response,
          creditsUsed: healed.meta?.cost_usdc ?? 0,
          durationMs: healed.meta?.latency_ms ?? 0,
          settled: healed.settled,
          txHash: healed.txHash,
        };
      }
      // Plain pass-through
      return {
        statusCode: response.status,
        intercepted: false,
        autoFixed: false,
        healed: false,
        data: body as T,
        creditsUsed: 0,
        durationMs: 0,
      };
    }

    // 402 — payment required
    if (response.status === 402) {
      const paymentSpec = (await response.json()) as X402PaymentRequired;

      if (this.onPaymentRequired) {
        const proof = await this.onPaymentRequired(paymentSpec);
        if (proof) {
          return this.retryWithPayment<T>(proxyBody, proof);
        }
      }

      // No payment callback or callback returned null
      return {
        statusCode: 402,
        intercepted: false,
        autoFixed: false,
        healed: false,
        data: paymentSpec as T,
        creditsUsed: 0,
        durationMs: 0,
        paymentRequired: paymentSpec,
      };
    }

    // Rate limit
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      throw new RateLimitError(body.error ?? "Rate limit exceeded", "");
    }

    // Other errors
    const body = await response.json().catch(() => ({}));
    throw new ProxyError(body.error ?? `Proxy error: ${response.status}`, response.status);
  }

  private async retryWithPayment<T>(
    proxyBody: string,
    paymentProof: string,
  ): Promise<GracefulFailResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/x402/proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": paymentProof,
        },
        body: proxyBody,
        signal: controller.signal,
      });

      if (response.ok) {
        const body = await response.json();
        if (body && typeof body === "object" && "healed" in body && body.healed) {
          const healed = body as X402HealedResponse;
          return {
            statusCode: healed.original_status_code,
            intercepted: true,
            autoFixed: false,
            healed: true,
            data: body as T,
            errorAnalysis: healed.error_analysis,
            rawResponse: healed.raw_destination_response,
            creditsUsed: healed.meta?.cost_usdc ?? 0,
            durationMs: healed.meta?.latency_ms ?? 0,
            settled: healed.settled,
            txHash: healed.txHash,
          };
        }
        return {
          statusCode: response.status,
          intercepted: false,
          autoFixed: false,
          healed: false,
          data: body as T,
          creditsUsed: 0,
          durationMs: 0,
        };
      }

      const body = await response.json().catch(() => ({}));
      throw new ProxyError(body.error ?? `Payment retry failed: ${response.status}`, response.status);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Legacy mode ────────────────────────────────────────────────────────

  private async requestLegacy<T>(
    method: string,
    url: string,
    options: RequestOptions,
  ): Promise<GracefulFailResponse<T>> {
    const proxyHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "X-Destination-URL": url,
      "X-Destination-Method": method.toUpperCase(),
      "X-Auto-Retry": this.autoRetry ? "true" : "false",
      ...this.llmHeaders,
    };

    if (options.headers) {
      Object.assign(proxyHeaders, options.headers);
    }

    let bodyStr: string | undefined;
    if (options.json !== undefined) {
      bodyStr = JSON.stringify(options.json);
      proxyHeaders["Content-Type"] = proxyHeaders["Content-Type"] ?? "application/json";
    } else if (options.body !== undefined) {
      bodyStr = options.body;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/proxy`, {
        method: "POST",
        headers: proxyHeaders,
        body: bodyStr,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ProxyError(
        `Failed to reach Graceful Fail proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    return this.parseLegacyResponse<T>(response);
  }

  private async parseLegacyResponse<T>(response: Response): Promise<GracefulFailResponse<T>> {
    if (response.status === 401) {
      const body = await response.json().catch(() => ({}));
      throw new AuthenticationError(body.error ?? "Authentication failed");
    }

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      throw new RateLimitError(body.error ?? "Rate limit exceeded", body.tier ?? "");
    }

    if (response.status === 502) {
      const body = await response.json().catch(() => ({}));
      throw new ProxyError(body.error ?? "Proxy error");
    }

    const body = await response.json();

    // Auto-fixed
    if (typeof body === "object" && body !== null && "selfheal_auto_fixed" in body && body.selfheal_auto_fixed === true) {
      const envelope = body as AutoFixedEnvelope;
      return {
        statusCode: envelope.meta.retry_status_code,
        intercepted: true,
        autoFixed: true,
        healed: false,
        data: envelope.data as T,
        errorAnalysis: envelope.original_error.error_analysis,
        rawResponse: envelope.original_error.raw_response,
        appliedDiff: envelope.applied_diff,
        creditsUsed: envelope.meta?.credits_used ?? 1,
        durationMs: envelope.meta?.duration_ms ?? 0,
      };
    }

    // Intercepted
    if (typeof body === "object" && body !== null && "graceful_fail_intercepted" in body && body.graceful_fail_intercepted === true) {
      const envelope = body as InterceptedEnvelope;
      return {
        statusCode: envelope.original_status_code,
        intercepted: true,
        autoFixed: false,
        healed: false,
        data: body as T,
        errorAnalysis: envelope.error_analysis,
        rawResponse: envelope.raw_destination_response,
        creditsUsed: envelope.meta?.credits_used ?? 1,
        durationMs: envelope.meta?.duration_ms ?? 0,
      };
    }

    // Pass-through success
    return {
      statusCode: response.status,
      intercepted: false,
      autoFixed: false,
      healed: false,
      data: body as T,
      creditsUsed: 0,
      durationMs: 0,
    };
  }

  // ── Convenience methods ────────────────────────────────────────────────

  async get<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("GET", url, options);
  }

  async post<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("POST", url, options);
  }

  async put<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("PUT", url, options);
  }

  async patch<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("PATCH", url, options);
  }

  async delete<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("DELETE", url, options);
  }
}
