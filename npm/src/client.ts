import { AuthenticationError, ProxyError, RateLimitError } from "./errors.js";
import type {
  GracefulFailOptions,
  GracefulFailResponse,
  InterceptedEnvelope,
  RequestOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://selfheal.dev";
const DEFAULT_TIMEOUT = 30_000;

/**
 * Graceful Fail client for Node.js and the browser.
 *
 * Routes HTTP requests through the Graceful Fail proxy. On success,
 * returns the destination response. On error, returns structured
 * LLM-powered fix instructions.
 *
 * @example
 * ```ts
 * import { GracefulFail } from "graceful-fail";
 *
 * const gf = new GracefulFail({ apiKey: "gf_your_key" });
 *
 * const resp = await gf.post("https://api.example.com/users", {
 *   json: { name: "Alice" },
 * });
 *
 * if (resp.intercepted) {
 *   console.log(resp.errorAnalysis!.actionable_fix_for_agent);
 * } else {
 *   console.log(resp.data);
 * }
 * ```
 */
export class GracefulFail {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(options: GracefulFailOptions) {
    if (!options.apiKey) {
      throw new Error("apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Send a request through the Graceful Fail proxy.
   */
  async request<T = unknown>(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Promise<GracefulFailResponse<T>> {
    const proxyHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "X-Destination-URL": url,
      "X-Destination-Method": method.toUpperCase(),
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

    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<GracefulFailResponse<T>> {
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

    if (
      typeof body === "object" &&
      body !== null &&
      "graceful_fail_intercepted" in body &&
      body.graceful_fail_intercepted === true
    ) {
      const envelope = body as InterceptedEnvelope;
      return {
        statusCode: envelope.original_status_code,
        intercepted: true,
        data: body as T,
        errorAnalysis: envelope.error_analysis,
        rawResponse: envelope.raw_destination_response,
        creditsUsed: envelope.meta?.credits_used ?? 1,
        durationMs: envelope.meta?.duration_ms ?? 0,
      };
    }

    return {
      statusCode: response.status,
      intercepted: false,
      data: body as T,
      creditsUsed: 0,
      durationMs: 0,
    };
  }

  /** Send a GET request through the proxy. */
  async get<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("GET", url, options);
  }

  /** Send a POST request through the proxy. */
  async post<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("POST", url, options);
  }

  /** Send a PUT request through the proxy. */
  async put<T = unknown>(url: string, options?: RequestOptions): Promise<GracefulFailResponse<T>> {
    return this.request<T>("PUT", url, options);
  }

  /** Send a PATCH request through the proxy. */
  async patch<T = unknown>(
    url: string,
    options?: RequestOptions,
  ): Promise<GracefulFailResponse<T>> {
    return this.request<T>("PATCH", url, options);
  }

  /** Send a DELETE request through the proxy. */
  async delete<T = unknown>(
    url: string,
    options?: RequestOptions,
  ): Promise<GracefulFailResponse<T>> {
    return this.request<T>("DELETE", url, options);
  }
}
