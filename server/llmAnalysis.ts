import { invokeLLM, type LLMOverrides } from "./_core/llm";
import { wrapUntrusted, UNTRUSTED_INSTRUCTION } from "./lib/prompt-delimit";

/** Headers that must be stripped before sending to the LLM to prevent credential leakage */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "proxy-authorization",
  "x-secret",
  "x-token",
  "api-key",
  "bearer",
]);

export function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safe[key] = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }
  }
  return safe;
}

// ── Provider Detection ────────────────────────────────────────────────────────

export type ApiProvider = "openai" | "anthropic" | "google" | "cohere" | "mistral" | "huggingface" | "azure_openai" | "other";

const PROVIDER_PATTERNS: Array<{ pattern: RegExp; provider: ApiProvider }> = [
  { pattern: /api\.openai\.com/i, provider: "openai" },
  { pattern: /api\.anthropic\.com/i, provider: "anthropic" },
  { pattern: /generativelanguage\.googleapis\.com/i, provider: "google" },
  { pattern: /api\.cohere\.(ai|com)/i, provider: "cohere" },
  { pattern: /api\.mistral\.ai/i, provider: "mistral" },
  { pattern: /api-inference\.huggingface\.co/i, provider: "huggingface" },
  { pattern: /\.openai\.azure\.com/i, provider: "azure_openai" },
];

export function detectProvider(url: string): ApiProvider {
  for (const { pattern, provider } of PROVIDER_PATTERNS) {
    if (pattern.test(url)) return provider;
  }
  return "other";
}

// ── Provider-Specific Context Injections ─────────────────────────────────────

function getProviderContext(provider: ApiProvider, statusCode: number): string {
  switch (provider) {
    case "openai":
      return `
## OpenAI-Specific Context
You are analyzing a failed OpenAI API request. Key OpenAI error patterns:
- **429 (rate_limit)**: Could be RPM (requests per minute), TPM (tokens per minute), or RPD (requests per day) limit. Check the 'error.message' for which limit was hit. Fix: implement exponential backoff, reduce request frequency, or upgrade tier.
- **401 (auth)**: Invalid API key, expired key, or wrong organization. The key must start with 'sk-'. Fix: regenerate the API key in the OpenAI dashboard.
- **400 with 'context_length_exceeded'**: The prompt + max_tokens exceeds the model's context window. Fix: reduce prompt length, use a model with larger context (gpt-4-turbo has 128k), or chunk the input.
- **400 with 'invalid_model'**: Model name is wrong or not available in the account. Fix: use exact model IDs like 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'.
- **400 with 'content_policy_violation'**: Request was blocked by content moderation. Fix: review and modify the prompt content.
- **500/503 (server_error)**: OpenAI service overload. Fix: retry with exponential backoff starting at 1 second.
- **model field**: Must be a string like "gpt-4o-mini", not an object.
- **messages array**: Each message needs 'role' (system/user/assistant) and 'content' (string or array of content parts).`;

    case "anthropic":
      return `
## Anthropic Claude-Specific Context
You are analyzing a failed Anthropic API request. Key Anthropic error patterns:
- **529 (overloaded)**: Anthropic servers are at capacity. Fix: retry with exponential backoff, starting at 30 seconds.
- **401 (auth)**: Invalid x-api-key header. The key must start with 'sk-ant-'. Fix: regenerate in Anthropic console.
- **400 with 'prompt_too_long'**: Input exceeds model context limit. Claude 3 Opus/Sonnet/Haiku support 200k tokens. Fix: reduce prompt length or split into chunks.
- **400 with 'invalid_request_error'**: Malformed request. Common issues: missing 'model' field, wrong message format, missing 'max_tokens'.
- **429 (rate_limit)**: Token or request rate limit exceeded. Fix: implement backoff, reduce concurrency.
- **model field**: Use aliases like "claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5". Legacy: "claude-sonnet-4-5", "claude-opus-4-5".
- **messages format**: Anthropic uses 'role' (user/assistant) and 'content'. System prompt goes in a top-level 'system' field, NOT in messages.
- **max_tokens**: Required field — Anthropic does not have a default. Must be explicitly set.
- **anthropic-version header**: Required — use "2023-06-01".`;

    case "google":
      return `
## Google Gemini-Specific Context
You are analyzing a failed Google Generative Language API request. Key patterns:
- **400 (INVALID_ARGUMENT)**: Malformed request, invalid model name, or unsupported parameter. Fix: check model name format (e.g., 'gemini-1.5-pro').
- **403 (PERMISSION_DENIED)**: API key doesn't have access to the requested model or the Generative Language API is not enabled. Fix: enable the API in Google Cloud Console.
- **429 (RESOURCE_EXHAUSTED)**: Quota exceeded. Fix: implement backoff or upgrade quota in Google Cloud Console.
- **model format**: Use 'models/gemini-1.5-pro' or 'gemini-1.5-pro' depending on the endpoint.`;

    case "cohere":
      return `
## Cohere-Specific Context
You are analyzing a failed Cohere API request. Key patterns:
- **401**: Invalid or missing API key in Authorization header. Key format: 'Bearer <key>'.
- **429**: Rate limit exceeded. Free tier has strict limits. Fix: upgrade plan or implement backoff.
- **400**: Malformed request. Check 'model' field (e.g., 'command-r-plus'), 'message' field for chat endpoint.`;

    case "mistral":
      return `
## Mistral AI-Specific Context
You are analyzing a failed Mistral API request. Key patterns:
- **401**: Invalid API key. Fix: check key in Mistral console.
- **422**: Validation error. Common: wrong model name (use 'mistral-large-latest', 'mistral-small-latest'), missing required fields.
- **429**: Rate limit. Fix: exponential backoff.`;

    case "azure_openai":
      return `
## Azure OpenAI-Specific Context
You are analyzing a failed Azure OpenAI API request. Key patterns:
- **401**: Invalid api-key header or wrong endpoint. Azure uses 'api-key' header, not 'Authorization: Bearer'.
- **404**: Deployment name not found. The URL path includes the deployment name — verify it matches exactly in Azure portal.
- **429**: Token rate limit or quota exceeded per deployment. Fix: reduce request rate or increase quota in Azure portal.
- **400**: API version mismatch. Ensure 'api-version' query param matches a supported version (e.g., '2024-02-01').`;

    default:
      return "";
  }
}

// ── Analysis Types ────────────────────────────────────────────────────────────

export interface AnalysisInput {
  destinationUrl: string;
  method: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  requestBody: unknown;
  statusCode: number;
  responseBody: unknown;
}

export interface ErrorAnalysis {
  is_retriable: boolean;
  human_readable_explanation: string;
  actionable_fix_for_agent: string;
  suggested_payload_diff: {
    remove: string[];
    add: Record<string, string>;
    modify: Record<string, string>;
  };
  error_category: "validation" | "auth" | "rate_limit" | "not_found" | "server_error" | "unknown";
  /** Detected API provider — added by analyzeError, not the LLM */
  provider?: ApiProvider;
}

const BASE_SYSTEM_PROMPT = `You are an expert API debugging assistant for autonomous AI agents.
Your job is to analyze a failed HTTP request and provide exact, actionable instructions so the agent can fix its payload and retry successfully.

CRITICAL: The suggested_payload_diff you return will be applied AUTOMATICALLY to the request body and retried. Your diff values must be exact, valid JSON values — not descriptions. The system will call JSON.parse on your values and patch the payload directly.

Rules:
- Be precise and direct. Your output is consumed by an AI agent, not a human.
- For 5xx or 429 errors, set is_retriable to true and advise exponential backoff.
- For 4xx errors (except 429), set is_retriable to true only if the payload can be fixed.
- For 401/403, set is_retriable to false — these require credential changes outside the agent's scope.
- In actionable_fix_for_agent, write a direct command (e.g., "Change the 'status' field value from string 'active' to integer 1").
- In suggested_payload_diff, provide EXACT values that should be used:
  - "remove": field names to delete from the payload (e.g., ["unsupported_field"])
  - "add": fields to add with their exact values (e.g., {"max_tokens": 1024} not {"max_tokens": "set to 1024"})
  - "modify": fields to change with their exact new values (e.g., {"model": "gpt-4o-mini"} not {"model": "change to gpt-4o-mini"})
  - Use dot notation for nested fields (e.g., "messages.0.role")
  - Values must be the actual JSON type needed (string, number, boolean, object, array) — never a description
- Classify the error_category accurately.
- NEVER reference or repeat any Authorization, API key, or credential values from the request.`;

export async function analyzeError(input: AnalysisInput, llmOverrides?: LLMOverrides): Promise<ErrorAnalysis> {
  const safeHeaders = sanitizeHeaders(input.requestHeaders);
  const provider = detectProvider(input.destinationUrl);
  const providerContext = getProviderContext(provider, input.statusCode);

  const systemPrompt = `${
    providerContext ? `${BASE_SYSTEM_PROMPT}\n${providerContext}` : BASE_SYSTEM_PROMPT
  }\n\n${UNTRUSTED_INSTRUCTION}`;

  // The request/response bodies are attacker-controlled (a hostile target API
  // can shape its error response to embed prompt-injection payloads). Wrap them
  // so the LLM treats them as data, not instructions.
  const bodyBlob = wrapUntrusted(
    `**Request Headers (sanitized):**\n${JSON.stringify(safeHeaders, null, 2)}\n\n` +
      `**Request Body:**\n${JSON.stringify(input.requestBody, null, 2)}\n\n` +
      `**Error Response Body:**\n${JSON.stringify(input.responseBody, null, 2)}`,
    { maxLength: 12000 },
  );

  const userMessage = `
## Failed API Request

**Destination:** ${input.method} ${input.destinationUrl}
**HTTP Status:** ${input.statusCode}
**Detected Provider:** ${provider}

${bodyBlob}

Analyze this failure and return your diagnosis as JSON.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "error_analysis",
          strict: false,
          schema: {
            type: "object",
            properties: {
              is_retriable: { type: "boolean", description: "Whether retrying (with fixes) could succeed" },
              human_readable_explanation: { type: "string", description: "Plain English explanation of why the request failed" },
              actionable_fix_for_agent: { type: "string", description: "Direct command telling the agent exactly what to change" },
              suggested_payload_diff: {
                type: "object",
                properties: {
                  remove: { type: "array", items: { type: "string" }, description: "Field names to remove from payload" },
                  add: { type: "object", additionalProperties: true, description: "Fields to add with their exact JSON values (not descriptions)" },
                  modify: { type: "object", additionalProperties: true, description: "Fields to modify with their exact new JSON values (not descriptions)" },
                },
                required: ["remove", "add", "modify"],
                additionalProperties: false,
              },
              error_category: {
                type: "string",
                enum: ["validation", "auth", "rate_limit", "not_found", "server_error", "unknown"],
              },
            },
            required: [
              "is_retriable",
              "human_readable_explanation",
              "actionable_fix_for_agent",
              "suggested_payload_diff",
              "error_category",
            ],
            additionalProperties: false,
          },
        },
      },
    }, llmOverrides);

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("Empty LLM response");
    const analysis = JSON.parse(content) as ErrorAnalysis;
    // Attach provider detection result (not from LLM — deterministic)
    analysis.provider = provider;
    return analysis;
  } catch (err) {
    console.error("[LLM Analysis] Failed:", err);
    // Graceful fallback — return a minimal analysis without crashing the proxy
    return {
      is_retriable: input.statusCode >= 500 || input.statusCode === 429,
      human_readable_explanation: `The destination API returned HTTP ${input.statusCode}. Automatic analysis is temporarily unavailable.`,
      actionable_fix_for_agent: input.statusCode === 429
        ? "You have been rate limited. Wait at least 60 seconds before retrying."
        : input.statusCode >= 500
          ? "The destination server encountered an internal error. Retry with exponential backoff."
          : "Review the request payload and headers against the destination API documentation.",
      suggested_payload_diff: { remove: [], add: {}, modify: {} },
      error_category: input.statusCode === 429 ? "rate_limit" : input.statusCode >= 500 ? "server_error" : "unknown",
      provider,
    };
  }
}
