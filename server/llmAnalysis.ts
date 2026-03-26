import { invokeLLM } from "./_core/llm";

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
}

const SYSTEM_PROMPT = `You are an expert API debugging assistant for autonomous AI agents. 
Your job is to analyze a failed HTTP request and provide exact, actionable instructions so the agent can fix its payload and retry successfully.

Rules:
- Be precise and direct. Your output is consumed by an AI agent, not a human.
- For 5xx or 429 errors, set is_retriable to true and advise exponential backoff.
- For 4xx errors (except 429), set is_retriable to true only if the payload can be fixed.
- For 401/403, set is_retriable to false — these require credential changes outside the agent's scope.
- In actionable_fix_for_agent, write a direct command (e.g., "Change the 'status' field value from string 'active' to integer 1").
- In suggested_payload_diff, list field names to remove, add, or modify.
- Classify the error_category accurately.
- NEVER reference or repeat any Authorization, API key, or credential values from the request.`;

export async function analyzeError(input: AnalysisInput): Promise<ErrorAnalysis> {
  const safeHeaders = sanitizeHeaders(input.requestHeaders);

  const userMessage = `
## Failed API Request

**Destination:** ${input.method} ${input.destinationUrl}
**HTTP Status:** ${input.statusCode}

**Request Headers (sanitized):**
${JSON.stringify(safeHeaders, null, 2)}

**Request Body:**
${JSON.stringify(input.requestBody, null, 2)}

**Error Response Body:**
${JSON.stringify(input.responseBody, null, 2)}

Analyze this failure and return your diagnosis as JSON.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "error_analysis",
          strict: true,
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
                  add: { type: "object", additionalProperties: { type: "string" }, description: "Fields to add with their expected types/values" },
                  modify: { type: "object", additionalProperties: { type: "string" }, description: "Fields to modify with new expected values" },
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
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("Empty LLM response");
    return JSON.parse(content) as ErrorAnalysis;
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
    };
  }
}
