/**
 * x402 Payment Protocol — outcome-based micropayments for SelfHeal.
 *
 * Agents only pay when a failure is successfully healed.
 * Successes pass through free. Failed analyses are never charged.
 *
 * Supports "exact" and "upto" payment schemes per the x402 spec.
 * Default facilitator: https://x402.org/facilitator
 */

// --- x402 Types ---

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
  outputSchema: Record<string, unknown>;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
    token: string;
  };
}

/** Decoded X-PAYMENT header (v1 format) */
export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: Record<string, unknown>;
}

export interface X402VerifyResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface X402SettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  errorReason?: string;
  errorMessage?: string;
}

// --- Pricing ---

export interface PricingTier {
  name: string;
  /** Base price in USDC (e.g., 0.001) */
  basePrice: number;
  /** Max price for upto scheme */
  maxPrice: number;
  /** Error patterns that match this tier */
  patterns: string[];
}

const DEFAULT_PRICING: PricingTier[] = [
  {
    name: "simple",
    basePrice: 0.001,
    maxPrice: 0.002,
    patterns: ["400", "404", "405", "422", "ECONNREFUSED", "ENOTFOUND"],
  },
  {
    name: "moderate",
    basePrice: 0.002,
    maxPrice: 0.003,
    patterns: ["500", "502", "503", "timeout", "ETIMEDOUT", "ECONNRESET"],
  },
  {
    name: "complex",
    basePrice: 0.003,
    maxPrice: 0.005,
    patterns: ["rate_limit", "429", "auth", "permission", "forbidden", "403"],
  },
];

const NORMALIZE_PRICING: PricingTier[] = [
  {
    name: "normalize-simple",
    basePrice: 0.001,
    maxPrice: 0.002,
    patterns: ["simple"],
  },
  {
    name: "normalize-moderate",
    basePrice: 0.002,
    maxPrice: 0.003,
    patterns: ["moderate"],
  },
  {
    name: "normalize-complex",
    basePrice: 0.002,
    maxPrice: 0.004,
    patterns: ["complex"],
  },
];

const USDC_DECIMALS = 6;

function usdcToAtomic(usd: number): string {
  return Math.round(usd * 10 ** USDC_DECIMALS).toString();
}

// --- Network Config ---

interface NetworkConfig {
  name: string;
  chainId?: number;
  usdcToken: string;
}

const SUPPORTED_NETWORKS: NetworkConfig[] = [
  {
    name: "base",
    chainId: 8453,
    usdcToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    name: "base-sepolia",
    chainId: 84532,
    usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
];

// --- x402 Config ---

export interface X402Config {
  facilitatorUrl: string;
  receivingWallet: string;
  networks: string[];
  pricingTiers?: PricingTier[];
  testnet: boolean;
  deadlineSeconds: number;
}

export function loadX402Config(): X402Config {
  const pricingEnv = process.env.X402_PRICING_CONFIG;
  let customPricing: PricingTier[] | undefined;
  if (pricingEnv) {
    try {
      customPricing = JSON.parse(pricingEnv);
    } catch {
      // Ignore invalid JSON, use defaults
    }
  }

  return {
    facilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    receivingWallet: process.env.X402_RECEIVING_WALLET ?? "",
    networks: (process.env.X402_NETWORKS ?? "base-sepolia")
      .split(",")
      .map((n) => n.trim()),
    pricingTiers: customPricing,
    testnet: process.env.X402_TESTNET === "true",
    deadlineSeconds: parseInt(process.env.X402_DEADLINE_SECONDS ?? "300"),
  };
}

// --- Pricing Engine ---

export class PricingEngine {
  private tiers: PricingTier[];
  private normalizeTiers: PricingTier[];

  constructor(customTiers?: PricingTier[]) {
    this.tiers = customTiers ?? DEFAULT_PRICING;
    this.normalizeTiers = NORMALIZE_PRICING;
  }

  getTier(errorMessage: string, statusCode?: number): PricingTier {
    // SECURITY H4: authoritative by status code, not by attacker-controlled
    // response body. Without this, an attacker can embed "404" in a 429
    // response body and get charged the cheaper simple-tier price.
    if (typeof statusCode === "number" && statusCode > 0) {
      const simple = this.tiers.find((t) => t.name === "simple");
      const moderate = this.tiers.find((t) => t.name === "moderate");
      const complex = this.tiers.find((t) => t.name === "complex");
      // 401/403/429 = complex (auth / rate-limit — typically hardest heals)
      if ([401, 403, 429].includes(statusCode) && complex) return complex;
      // 5xx = moderate (server errors, often retriable)
      if (statusCode >= 500 && moderate) return moderate;
      // 4xx (other) = simple (bad payload, typos)
      if (statusCode >= 400 && simple) return simple;
    }
    // No status code = network-level error (ECONNREFUSED, DNS fail).
    // Fall back to body pattern matching.
    const searchStr = errorMessage.toLowerCase();
    for (const tier of this.tiers) {
      if (tier.patterns.some((p) => searchStr.includes(p.toLowerCase()))) {
        return tier;
      }
    }
    return this.tiers[1] ?? DEFAULT_PRICING[1];
  }

  getNormalizeTier(complexity: "simple" | "moderate" | "complex"): PricingTier {
    for (const tier of this.normalizeTiers) {
      if (tier.patterns.includes(complexity)) return tier;
    }
    return this.normalizeTiers[0] ?? NORMALIZE_PRICING[0];
  }

  getAllTiers(): PricingTier[] {
    return [...this.tiers, ...this.normalizeTiers];
  }
}

// --- Facilitator Client ---

export class FacilitatorClient {
  constructor(private facilitatorUrl: string) {}

  async verify(
    paymentPayload: X402PaymentPayload,
    paymentRequirements: X402PaymentScheme,
  ): Promise<X402VerifyResult> {
    // SECURITY H2: bound facilitator verify at 5s. Without this, a hanging
    // facilitator piles up active requests and DoS's the dyno.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const resp = await fetch(`${this.facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: paymentPayload.x402Version,
          paymentPayload,
          paymentRequirements,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return { isValid: false, invalidReason: `Facilitator error ${resp.status}: ${text.slice(0, 200)}` };
      }
      return (await resp.json()) as X402VerifyResult;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        isValid: false,
        invalidReason: isTimeout
          ? "Facilitator verify timeout (>5s)"
          : `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async settle(
    paymentPayload: X402PaymentPayload,
    paymentRequirements: X402PaymentScheme,
  ): Promise<X402SettleResult> {
    // SECURITY H2: bound facilitator settle at 10s (settle can be slower
    // than verify because it's an on-chain transaction).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const resp = await fetch(`${this.facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: paymentPayload.x402Version,
          paymentPayload,
          paymentRequirements,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return { success: false, errorMessage: `Facilitator settle error ${resp.status}: ${text.slice(0, 200)}` };
      }
      return (await resp.json()) as X402SettleResult;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        success: false,
        errorMessage: isTimeout
          ? "Facilitator settle timeout (>10s)"
          : `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// --- x402 Response Builder ---

export function build402Response(
  config: X402Config,
  pricing: PricingEngine,
  errorMessage: string,
  statusCode?: number,
  resource?: string,
): X402PaymentRequired {
  const tier = pricing.getTier(errorMessage, statusCode);
  const enabledNetworks = SUPPORTED_NETWORKS.filter((n) =>
    config.networks.includes(n.name),
  );

  const accepts: X402PaymentScheme[] = [];

  for (const net of enabledNetworks) {
    accepts.push({
      scheme: "exact",
      network: net.name,
      maxAmountRequired: usdcToAtomic(tier.basePrice),
      resource: resource ?? "/api/proxy",
      description: `SelfHeal: error analysis + structured fix + retry payload [${tier.name}]`,
      mimeType: "application/json",
      outputSchema: {},
      payTo: config.receivingWallet,
      maxTimeoutSeconds: config.deadlineSeconds,
      asset: net.usdcToken,
      extra: { name: "USDC", version: "2", token: net.usdcToken },
    });
  }

  return {
    x402Version: 1,
    accepts,
    error: `Payment required for error analysis. Tier: ${tier.name} ($${tier.basePrice}\u2013$${tier.maxPrice} USDC). ${errorMessage}`,
  };
}

// --- Payment Extraction ---

/** Decode the X-PAYMENT header into a full payment payload object */
export function extractPaymentPayload(
  headers: Record<string, string | string[] | undefined>,
): X402PaymentPayload | null {
  const paymentHeader =
    (headers["x-payment"] as string) ??
    (headers["x-payment-response"] as string);

  if (!paymentHeader) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8"),
    );
    return decoded as X402PaymentPayload;
  } catch {
    return null;
  }
}
