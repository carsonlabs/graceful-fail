/**
 * OpenAPI 3.1 specification for the SelfHeal API.
 * Served at GET /api/openapi.json — no authentication required.
 */
export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "SelfHeal API",
      version: "2.0.0",
      description:
        "An agent-native API proxy with x402 outcome-based pricing. " +
        "Agents send requests through the proxy — successes pass through free, " +
        "failures return x402 payment specs. Agents pay $0.001-$0.005 USDC per successful heal. " +
        "No API keys, no subscriptions, no accounts.",
      contact: {
        name: "SelfHeal",
        url: `${baseUrl}/docs`,
      },
      license: { name: "MIT" },
    },
    servers: [{ url: baseUrl, description: "Production" }],
    paths: {
      "/api/x402/proxy": {
        post: {
          operationId: "x402Proxy",
          summary: "Proxy a request with x402 payment on failure",
          description:
            "Forward an HTTP request to the target URL. Successes pass through free. " +
            "Failures return HTTP 402 with x402 payment spec. After payment, returns " +
            "LLM-powered error analysis. Payment only settles on successful heal. " +
            "Optionally include target_schema for response normalization.",
          tags: ["x402 Proxy"],
          parameters: [
            {
              name: "X-PAYMENT",
              in: "header",
              required: false,
              description: "x402 payment proof (base64-encoded JSON). Include after receiving a 402 response.",
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProxyRequest" },
                example: {
                  url: "https://api.example.com/users",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: '{"name": "Alice"}',
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Success — either free pass-through or healed response.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/PassThroughResponse" },
                      { $ref: "#/components/schemas/HealedResponse" },
                    ],
                  },
                },
              },
            },
            "402": {
              description: "Payment required — target API returned an error, x402 payment spec returned.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/X402PaymentRequired" },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RateLimitError" },
                },
              },
            },
            "502": {
              description: "Heal analysis failed — payment was NOT settled.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealFailedResponse" },
                },
              },
            },
          },
        },
      },
      "/api/x402/heal": {
        post: {
          operationId: "x402Heal",
          summary: "Direct error analysis (submit an error for diagnosis)",
          description: "Submit error details directly for LLM analysis. Requires x402 payment.",
          tags: ["x402 Proxy"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Healed — error was successfully diagnosed.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealedResponse" } } },
            },
            "402": {
              description: "Payment required.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/X402PaymentRequired" } } },
            },
          },
        },
      },
      "/api/x402/pricing": {
        get: {
          operationId: "getPricing",
          summary: "Current pricing tiers",
          tags: ["Info"],
          responses: {
            "200": {
              description: "Pricing tiers and x402 config.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PricingResponse" } } },
            },
          },
        },
      },
      "/api/x402/usage": {
        get: {
          operationId: "getUsage",
          summary: "Usage statistics",
          tags: ["Info"],
          responses: {
            "200": {
              description: "Proxy, heal, x402, and LLM usage stats.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Health check",
          tags: ["Info"],
          responses: {
            "200": {
              description: "Service health.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      service: { type: "string", example: "selfheal" },
                      x402Enabled: { type: "boolean", example: true },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/metrics": {
        get: {
          operationId: "getMetrics",
          summary: "Prometheus metrics",
          tags: ["Info"],
          responses: {
            "200": {
              description: "Prometheus-format metrics.",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/proxy": {
        post: {
          operationId: "legacyProxy",
          summary: "Legacy proxy (API key auth)",
          description: "Original proxy endpoint with API key authentication. Use /api/x402/proxy for new integrations.",
          tags: ["Legacy"],
          deprecated: true,
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "See /api/x402/proxy for response schema." },
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
          description: "Legacy SelfHeal API key (gf_...). Not needed for x402 endpoints.",
        },
      },
      schemas: {
        ProxyRequest: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", format: "uri", description: "Target API URL" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
            headers: { type: "object", additionalProperties: { type: "string" }, description: "Headers to forward" },
            body: { type: "string", description: "Request body to forward" },
            timeoutMs: { type: "integer", default: 30000, description: "Timeout in milliseconds" },
            target_schema: {
              type: "object",
              description: "Optional JSON Schema for response normalization. When provided, SelfHeal normalizes the response to match. Already-compliant responses are free.",
            },
          },
        },
        PassThroughResponse: {
          type: "object",
          properties: {
            status: { type: "integer", example: 200 },
            headers: { type: "object" },
            body: { type: "string" },
          },
        },
        HealedResponse: {
          type: "object",
          properties: {
            healed: { type: "boolean", example: true },
            settled: { type: "boolean", example: true },
            transaction: { type: "string", description: "On-chain settlement TX hash" },
            original_status_code: { type: "integer", example: 401 },
            error_analysis: { $ref: "#/components/schemas/ErrorAnalysis" },
            raw_destination_response: { description: "Original error response from target" },
            meta: {
              type: "object",
              properties: {
                tier: { type: "string", example: "complex" },
                cost_usdc: { type: "number", example: 0.003 },
                latency_ms: { type: "integer", example: 3038 },
              },
            },
          },
        },
        ErrorAnalysis: {
          type: "object",
          properties: {
            is_retriable: { type: "boolean" },
            human_readable_explanation: { type: "string" },
            actionable_fix_for_agent: { type: "string" },
            suggested_payload_diff: { $ref: "#/components/schemas/PayloadDiff" },
            error_category: { type: "string", enum: ["validation", "auth", "not_found", "rate_limit", "server_error", "unknown"] },
          },
        },
        PayloadDiff: {
          type: "object",
          properties: {
            remove: { type: "array", items: { type: "string" } },
            add: { type: "object", additionalProperties: true },
            modify: { type: "object", additionalProperties: true },
          },
        },
        X402PaymentRequired: {
          type: "object",
          properties: {
            x402Version: { type: "integer", example: 1 },
            accepts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scheme: { type: "string", example: "exact" },
                  network: { type: "string", example: "base-sepolia" },
                  maxAmountRequired: { type: "string", example: "3000" },
                  resource: { type: "string" },
                  description: { type: "string" },
                  payTo: { type: "string", description: "Wallet address for USDC payment" },
                  asset: { type: "string", description: "USDC contract address" },
                  maxTimeoutSeconds: { type: "integer", example: 300 },
                },
              },
            },
            error: { type: "string" },
          },
        },
        HealRequest: {
          type: "object",
          required: ["url", "statusCode", "errorBody"],
          properties: {
            url: { type: "string" },
            method: { type: "string", default: "GET" },
            headers: { type: "object" },
            body: { type: "string" },
            statusCode: { type: "integer" },
            errorBody: { type: "string" },
          },
        },
        HealFailedResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            reason: { type: "string" },
            refunded: { type: "boolean", example: true },
            hint: { type: "string", example: "Payment was NOT settled. You were not charged." },
          },
        },
        PricingResponse: {
          type: "object",
          properties: {
            model: { type: "string", example: "outcome-based" },
            description: { type: "string" },
            currency: { type: "string", example: "USDC" },
            networks: { type: "array", items: { type: "string" } },
            tiers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  basePrice: { type: "number" },
                  maxPrice: { type: "number" },
                },
              },
            },
            protocol: { type: "string", example: "x402" },
            facilitator: { type: "string", format: "uri" },
          },
        },
        RateLimitError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Rate limit exceeded" },
            retryAfterSeconds: { type: "integer", example: 60 },
          },
        },
      },
    },
    tags: [
      { name: "x402 Proxy", description: "x402-powered proxy and heal endpoints" },
      { name: "Info", description: "Pricing, usage, health, and metrics" },
      { name: "Legacy", description: "Legacy API key-authenticated endpoints (deprecated)" },
    ],
  };
}
