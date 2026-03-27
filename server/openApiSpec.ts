/**
 * OpenAPI 3.1 specification for the SelfHeal API Proxy.
 * Served at GET /api/openapi.json — no authentication required.
 */
export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "SelfHeal API",
      version: "1.0.0",
      description:
        "An intelligent API proxy for AI agents. SelfHeal sits between your agent and any third-party API. On success it passes the response through with zero overhead. On failure it returns a structured, LLM-generated analysis that tells your agent exactly what went wrong and how to fix it.",
      contact: {
        name: "SelfHeal Support",
        url: `${baseUrl}/docs`,
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Production",
      },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/proxy": {
        post: {
          operationId: "proxyRequest",
          summary: "Proxy a request to a destination API",
          description:
            "Forwards an HTTP request to the URL specified in `X-Destination-URL`. " +
            "Successful responses (2xx/3xx) are returned verbatim with no overhead. " +
            "Failed responses (4xx/5xx) are intercepted and enriched with LLM-powered error analysis. " +
            "One credit is consumed only when a request is intercepted.",
          tags: ["Proxy"],
          parameters: [
            {
              name: "X-Destination-URL",
              in: "header",
              required: true,
              description: "Full URL of the target API endpoint",
              schema: { type: "string", format: "uri", example: "https://api.example.com/users" },
            },
            {
              name: "X-Destination-Method",
              in: "header",
              required: false,
              description: "HTTP method to use for the destination request. Defaults to POST.",
              schema: {
                type: "string",
                enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                default: "POST",
              },
            },
            {
              name: "X-LLM-API-Key",
              in: "header",
              required: false,
              description: "Bring your own LLM key. If provided, error analysis uses this key instead of the SelfHeal default. Supports any OpenAI-compatible API.",
              schema: { type: "string" },
            },
            {
              name: "X-LLM-Model",
              in: "header",
              required: false,
              description: "Override the LLM model used for error analysis (e.g. gpt-4o, claude-3-5-sonnet). Requires X-LLM-API-Key or X-LLM-Base-URL.",
              schema: { type: "string", example: "gpt-4o" },
            },
            {
              name: "X-LLM-Base-URL",
              in: "header",
              required: false,
              description: "Override the LLM API base URL (e.g. https://api.anthropic.com for Anthropic, or your Azure OpenAI endpoint). Must be OpenAI-compatible.",
              schema: { type: "string", format: "uri" },
            },
          ],
          requestBody: {
            required: false,
            description: "Request body to forward to the destination API (any JSON payload).",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
                example: { name: "Alice", email: "alice@example.com" },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Pass-through: the destination returned 2xx/3xx. The response body is the destination's verbatim response.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                  example: { id: 42, name: "Alice", email: "alice@example.com" },
                },
              },
            },
            "4XX": {
              description:
                "Intercepted error: the destination returned 4xx. The response body is the SelfHeal error envelope.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/GracefulFailErrorEnvelope" },
                  example: {
                    graceful_fail_intercepted: true,
                    original_status_code: 422,
                    destination_url: "https://api.example.com/users",
                    error_analysis: {
                      is_retriable: false,
                      human_readable_explanation:
                        "The request body is missing the required 'email' field.",
                      actionable_fix_for_agent:
                        "Add the 'email' field (valid email string) to the request body before retrying.",
                      suggested_payload_diff: {
                        remove: [],
                        add: { email: "string (valid email address)" },
                        modify: {},
                      },
                      error_category: "validation_error",
                    },
                    raw_destination_response: {
                      error: "Unprocessable Entity",
                      details: [{ field: "email", message: "is required" }],
                    },
                    meta: { credits_used: 1, duration_ms: 312, tier: "hobby" },
                  },
                },
              },
            },
            "5XX": {
              description:
                "Intercepted error: the destination returned 5xx. Same SelfHeal envelope as 4xx.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/GracefulFailErrorEnvelope" },
                },
              },
            },
            "401": {
              description: "Missing or invalid SelfHeal API key.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProxyAuthError" },
                },
              },
            },
            "429": {
              description: "Monthly request limit reached for the current tier.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RateLimitError" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "SelfHeal API key. Format: `gf_<hex>`. Create keys in the Dashboard.",
        },
      },
      schemas: {
        GracefulFailErrorEnvelope: {
          type: "object",
          required: [
            "graceful_fail_intercepted",
            "original_status_code",
            "destination_url",
            "error_analysis",
          ],
          properties: {
            graceful_fail_intercepted: {
              type: "boolean",
              description: "Always `true` for intercepted errors.",
              example: true,
            },
            original_status_code: {
              type: "integer",
              description: "HTTP status code returned by the destination API.",
              example: 422,
            },
            destination_url: {
              type: "string",
              format: "uri",
              description: "The destination URL that was proxied.",
            },
            error_analysis: {
              $ref: "#/components/schemas/ErrorAnalysis",
            },
            raw_destination_response: {
              description: "The original response body from the destination API.",
            },
            meta: {
              $ref: "#/components/schemas/RequestMeta",
            },
          },
        },
        ErrorAnalysis: {
          type: "object",
          required: [
            "is_retriable",
            "human_readable_explanation",
            "actionable_fix_for_agent",
            "suggested_payload_diff",
            "error_category",
          ],
          properties: {
            is_retriable: {
              type: "boolean",
              description: "Whether retrying the same request may succeed (e.g. 429, 503).",
            },
            human_readable_explanation: {
              type: "string",
              description: "Plain-English explanation of what went wrong.",
            },
            actionable_fix_for_agent: {
              type: "string",
              description: "Exact instruction for the agent on how to correct the request.",
            },
            suggested_payload_diff: {
              $ref: "#/components/schemas/PayloadDiff",
            },
            error_category: {
              type: "string",
              enum: [
                "validation_error",
                "authentication_error",
                "authorization_error",
                "not_found",
                "rate_limit",
                "server_error",
                "timeout",
                "unknown",
              ],
              description: "Classified error category.",
            },
          },
        },
        PayloadDiff: {
          type: "object",
          required: ["remove", "add", "modify"],
          properties: {
            remove: {
              type: "array",
              items: { type: "string" },
              description: "Fields to remove from the request body.",
            },
            add: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Fields to add, with expected type as value.",
            },
            modify: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Fields to change, with suggested new value.",
            },
          },
        },
        RequestMeta: {
          type: "object",
          properties: {
            credits_used: {
              type: "integer",
              description: "Number of credits consumed (1 for intercepted errors, 0 for pass-through).",
            },
            duration_ms: {
              type: "integer",
              description: "Total proxy round-trip time in milliseconds.",
            },
            tier: {
              type: "string",
              enum: ["hobby", "pro", "agency"],
              description: "The API key tier used for this request.",
            },
          },
        },
        ProxyAuthError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Unauthorized" },
            message: { type: "string", example: "Missing or invalid API key" },
          },
        },
        RateLimitError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Rate limit exceeded" },
            message: { type: "string", example: "Monthly request limit reached for hobby tier" },
            upgrade_url: { type: "string", format: "uri" },
          },
        },
      },
    },
    tags: [
      {
        name: "Proxy",
        description: "The single proxy endpoint that forwards requests and intercepts errors.",
      },
    ],
  };
}
