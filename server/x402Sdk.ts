/**
 * SelfHeal SDK — one-line x402 integration for agent frameworks.
 *
 * Works with LangChain, CrewAI, OpenAI function calling, or any HTTP client.
 * Automatically handles x402 payment flow: detect 402 → pay → retry.
 *
 * Usage:
 *   import { SelfHealClient } from "selfheal/sdk";
 *   const client = new SelfHealClient({ baseUrl: "https://selfheal.dev" });
 *   const result = await client.proxy({ url: "https://api.example.com/data" });
 */

// --- Client ---

export interface SelfHealClientConfig {
  /** SelfHeal server URL (e.g., "https://selfheal.dev") */
  baseUrl: string;
  /** x402 payment callback — called when 402 is received, must return payment proof */
  onPaymentRequired?: (paymentInfo: PaymentRequiredInfo) => Promise<string | null>;
  /** Maximum auto-retries after payment (default: 1) */
  maxPaymentRetries?: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
}

export interface PaymentRequiredInfo {
  accepts: {
    scheme: "exact" | "upto";
    network: string;
    maxAmountRequired: string;
    description: string;
    payTo: string;
    extra: { name: string; token: string };
  }[];
  error: string;
}

export interface ProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface ProxyResponse {
  success: boolean;
  healed: boolean;
  paid: boolean;
  status?: number;
  body?: string;
  healResult?: {
    is_retriable: boolean;
    human_readable_explanation: string;
    actionable_fix_for_agent: string;
    error_category: string;
  };
  txHash?: string;
  error?: string;
}

export class SelfHealClient {
  private config: Required<SelfHealClientConfig>;

  constructor(config: SelfHealClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      onPaymentRequired: config.onPaymentRequired ?? (() => Promise.resolve(null)),
      maxPaymentRetries: config.maxPaymentRetries ?? 1,
      timeoutMs: config.timeoutMs ?? 60_000,
    };
  }

  async proxy(req: ProxyRequest): Promise<ProxyResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      // First attempt — no payment
      const firstResp = await fetch(`${this.config.baseUrl}/api/x402/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      // Success — free pass-through
      if (firstResp.ok) {
        const data = await firstResp.json() as Record<string, unknown>;
        return {
          success: true,
          healed: false,
          paid: false,
          status: data.status as number | undefined,
          body: data.body as string | undefined,
        };
      }

      // Not a 402 — return error
      if (firstResp.status !== 402) {
        return {
          success: false,
          healed: false,
          paid: false,
          error: `SelfHeal returned ${firstResp.status}: ${await firstResp.text()}`,
        };
      }

      // 402 — payment required
      const paymentInfo = (await firstResp.json()) as PaymentRequiredInfo;
      const paymentProof = await this.config.onPaymentRequired(paymentInfo);
      if (!paymentProof) {
        return {
          success: false,
          healed: false,
          paid: false,
          error: "Payment required but no payment proof provided",
        };
      }

      // Retry with payment
      for (let i = 0; i < this.config.maxPaymentRetries; i++) {
        const paidResp = await fetch(`${this.config.baseUrl}/api/x402/proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": paymentProof,
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (paidResp.ok) {
          const data = await paidResp.json() as Record<string, unknown>;
          return {
            success: true,
            healed: (data.healed as boolean) ?? false,
            paid: true,
            healResult: data.error_analysis as ProxyResponse["healResult"],
            txHash: data.txHash as string | undefined,
          };
        }

        if (paidResp.status === 402) {
          return {
            success: false,
            healed: false,
            paid: false,
            error: "Payment verification failed",
          };
        }
      }

      return { success: false, healed: false, paid: true, error: "Heal failed after payment" };
    } finally {
      clearTimeout(timer);
    }
  }

  async getPricing(): Promise<unknown> {
    const resp = await fetch(`${this.config.baseUrl}/api/x402/pricing`);
    return resp.json();
  }

  async getUsage(): Promise<unknown> {
    const resp = await fetch(`${this.config.baseUrl}/api/x402/usage`);
    return resp.json();
  }
}

// --- LangChain Tool Wrapper ---

export function createLangChainTool(config: SelfHealClientConfig) {
  const client = new SelfHealClient(config);

  return {
    name: "selfheal_proxy",
    description:
      "Make an HTTP request through SelfHeal proxy. If the request fails, " +
      "SelfHeal will analyze the error and return structured fix instructions. " +
      "Success responses pass through free. Only failures cost (x402 micropayment).",
    schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Target URL" },
        method: { type: "string", description: "HTTP method", default: "GET" },
        headers: { type: "object", description: "Request headers" },
        body: { type: "string", description: "Request body" },
      },
      required: ["url"],
    },
    func: async (input: ProxyRequest): Promise<string> => {
      const result = await client.proxy(input);
      return JSON.stringify(result, null, 2);
    },
  };
}

// --- CrewAI Tool Spec ---

export function createCrewAIToolSpec(baseUrl: string) {
  return {
    name: "SelfHeal API Proxy",
    description:
      "Proxy HTTP requests with automatic error healing. " +
      "Successes are free. Failures trigger x402 payment for LLM analysis. " +
      "Returns structured fix instructions and retry payloads.",
    endpoint: `${baseUrl}/api/x402/proxy`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    input_schema: {
      url: "string (required) — target URL",
      method: "string (optional, default: GET)",
      headers: "object (optional) — headers to forward",
      body: "string (optional) — request body",
    },
    payment_header: "X-PAYMENT — x402 payment proof (required for heal analysis)",
    pricing: `${baseUrl}/api/x402/pricing`,
  };
}
