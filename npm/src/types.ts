/** Suggested changes to fix the request payload. */
export interface PayloadDiff {
  remove: string[];
  add: Record<string, string>;
  modify: Record<string, string>;
}

/** LLM-generated analysis of an API error. */
export interface ErrorAnalysis {
  is_retriable: boolean;
  human_readable_explanation: string;
  actionable_fix_for_agent: string;
  suggested_payload_diff: PayloadDiff;
  error_category:
    | "validation_error"
    | "authentication_error"
    | "authorization_error"
    | "not_found"
    | "rate_limit"
    | "server_error"
    | "timeout"
    | "unknown";
}

/** Full Graceful Fail intercepted error envelope. */
export interface InterceptedEnvelope {
  graceful_fail_intercepted: true;
  original_status_code: number;
  destination_url: string;
  error_analysis: ErrorAnalysis;
  raw_destination_response: unknown;
  meta: {
    credits_used: number;
    duration_ms: number;
    tier: string;
  };
}

/** Unified response from the Graceful Fail proxy. */
export interface GracefulFailResponse<T = unknown> {
  /** HTTP status code from the destination API. */
  statusCode: number;
  /** True if the error was intercepted and analyzed by the LLM. */
  intercepted: boolean;
  /** Response data. On success, the destination response. On interception, the full envelope. */
  data: T;
  /** LLM-generated error analysis (only when intercepted). */
  errorAnalysis?: ErrorAnalysis;
  /** The raw destination API response body (only when intercepted). */
  rawResponse?: unknown;
  /** Credits consumed (0 for pass-through, 1 for intercepted). */
  creditsUsed: number;
  /** Total proxy round-trip time in milliseconds. */
  durationMs: number;
}

/** Options for creating a GracefulFail client. */
export interface GracefulFailOptions {
  /** Your Graceful Fail API key (starts with gf_). */
  apiKey: string;
  /** Base URL of the Graceful Fail proxy. Defaults to https://selfheal.dev */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Bring your own LLM API key for error analysis (any OpenAI-compatible key). */
  llmApiKey?: string;
  /** Override the LLM model used for error analysis (e.g. gpt-4o). */
  llmModel?: string;
  /** Override the LLM API base URL (e.g. Azure OpenAI endpoint). */
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
