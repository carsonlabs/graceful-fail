/** Suggested changes to fix the request payload. */
export interface PayloadDiff {
  remove: string[];
  add: Record<string, unknown>;
  modify: Record<string, unknown>;
}

/** LLM-generated analysis of an API error. */
export interface ErrorAnalysis {
  is_retriable: boolean;
  human_readable_explanation: string;
  actionable_fix_for_agent: string;
  suggested_payload_diff: PayloadDiff;
  error_category:
    | "validation"
    | "auth"
    | "not_found"
    | "rate_limit"
    | "server_error"
    | "unknown"
    // Legacy categories (v1 API)
    | "validation_error"
    | "authentication_error"
    | "authorization_error"
    | "timeout";
}

/** Full Graceful Fail intercepted error envelope (legacy v1 API). */
export interface InterceptedEnvelope {
  graceful_fail_intercepted: true;
  selfheal_auto_fixed?: boolean;
  original_status_code: number;
  destination_url: string;
  error_analysis: ErrorAnalysis;
  raw_destination_response: unknown;
  retry_attempted?: boolean;
  retry_status_code?: number;
  retry_response?: unknown;
  meta: {
    credits_used: number;
    duration_ms: number;
    tier: string;
    retry_status_code?: number;
  };
}

/** Response envelope when SelfHeal auto-fixed the request (legacy v1 API). */
export interface AutoFixedEnvelope {
  selfheal_auto_fixed: true;
  data: unknown;
  original_error: {
    status_code: number;
    error_analysis: ErrorAnalysis;
    raw_response: unknown;
  };
  applied_diff: PayloadDiff;
  meta: {
    credits_used: number;
    duration_ms: number;
    tier: string;
    retry_status_code: number;
  };
}

/** x402 payment spec returned when heal requires payment. */
export interface X402PaymentRequired {
  x402Version: 1;
  accepts: X402PaymentScheme[];
  error: string;
}

export interface X402PaymentScheme {
  scheme: "exact" | "upto";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  requiredDeadlineSeconds: number;
  extra: { name: string; token: string };
}

/** x402 healed response. */
export interface X402HealedResponse {
  healed: true;
  settled: boolean;
  txHash?: string;
  original_status_code: number;
  error_analysis: ErrorAnalysis;
  raw_destination_response: unknown;
  meta: { tier: string; cost_usdc: number; latency_ms: number };
}

/** Unified response from the Graceful Fail proxy. */
export interface GracefulFailResponse<T = unknown> {
  /** HTTP status code from the destination API. */
  statusCode: number;
  /** True if the error was intercepted and analyzed by the LLM. */
  intercepted: boolean;
  /** True if SelfHeal auto-fixed the payload and the retry succeeded (legacy only). */
  autoFixed: boolean;
  /** True if the error was healed via x402 payment. */
  healed: boolean;
  /** Response data. */
  data: T;
  /** LLM-generated error analysis (only when intercepted or healed). */
  errorAnalysis?: ErrorAnalysis;
  /** The raw destination API response body. */
  rawResponse?: unknown;
  /** The payload diff that was applied (only when auto-fixed, legacy). */
  appliedDiff?: PayloadDiff;
  /** Credits consumed (legacy) or USDC cost (x402). */
  creditsUsed: number;
  /** Total proxy round-trip time in milliseconds. */
  durationMs: number;
  /** x402 payment required spec (only when status 402). */
  paymentRequired?: X402PaymentRequired;
  /** Whether payment was settled (x402). */
  settled?: boolean;
  /** Transaction hash (x402). */
  txHash?: string;
}

/** Options for creating a GracefulFail client. */
export interface GracefulFailOptions {
  /** Your Graceful Fail API key (starts with gf_). Omit for x402 mode. */
  apiKey?: string;
  /** Base URL of the Graceful Fail proxy. Defaults to https://selfheal.dev */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Whether to auto-retry failed requests with LLM-suggested payload fixes. Defaults to true. Legacy only. */
  autoRetry?: boolean;
  /**
   * x402 payment callback. Called when a 402 is received.
   * Return the payment proof string, or null to skip payment.
   */
  onPaymentRequired?: (info: X402PaymentRequired) => Promise<string | null>;
  /** Bring your own LLM API key for error analysis (legacy only). */
  llmApiKey?: string;
  /** Override the LLM model used for error analysis (legacy only). */
  llmModel?: string;
  /** Override the LLM API base URL (legacy only). */
  llmBaseUrl?: string;
}

/** Options for a proxy request. */
export interface RequestOptions {
  /** Additional headers to forward to the destination API. */
  headers?: Record<string, string>;
  /** JSON body to send (for POST, PUT, PATCH). */
  json?: unknown;
  /** Raw string body to send. */
  body?: string;
}
