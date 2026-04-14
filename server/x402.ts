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
  payTo: string;
  requiredDeadlineSeconds: number;
  extra: {
    name: string;
    token: string;
  };
}

export interface X402PaymentProof {
  payload: string;
  scheme: "exact" | "upto";
}

export interface X402VerifyResult {
  valid: boolean;
  amountPaid?: string;
  invalidReason?: string;
}

export interface X402SettleResult {
  success: boolean;
  txHash?: string;
  error?: string;
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
    name: "eip155:8453",
    chainId: 8453,
    usdcToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    name: "eip155:84532",
    chainId: 84532,
    usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    name: "solana:mainnet",
    usdcToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
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
    networks: (process.env.X402_NETWORKS ?? "eip155:84532")
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

  constructor(customTiers?: PricingTier[]) {
    this.tiers = customTiers ?? DEFAULT_PRICING;
  }

  getTier(errorMessage: string, statusCode?: number): PricingTier {
    const searchStr = `${statusCode ?? ""} ${errorMessage}`.toLowerCase();
    for (const tier of this.tiers) {
      if (tier.patterns.some((p) => searchStr.includes(p.toLowerCase()))) {
        return tier;
      }
    }
    return this.tiers[1] ?? DEFAULT_PRICING[1];
  }

  getAllTiers(): PricingTier[] {
    return this.tiers;
  }
}

// --- Facilitator Client ---

export class FacilitatorClient {
  constructor(private facilitatorUrl: string) {}

  async verify(
    paymentHeader: string,
    expectedAmount: string,
    payTo: string,
  ): Promise<X402VerifyResult> {
    try {
      const resp = await fetch(`${this.facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: paymentHeader, expectedAmount, payTo }),
      });
      if (!resp.ok) {
        return { valid: false, invalidReason: `Facilitator error: ${resp.status}` };
      }
      return (await resp.json()) as X402VerifyResult;
    } catch (err) {
      return {
        valid: false,
        invalidReason: `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async settle(
    paymentHeader: string,
    payTo: string,
  ): Promise<X402SettleResult> {
    try {
      const resp = await fetch(`${this.facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: paymentHeader, payTo }),
      });
      if (!resp.ok) {
        return { success: false, error: `Facilitator settle error: ${resp.status}` };
      }
      return (await resp.json()) as X402SettleResult;
    } catch (err) {
      return {
        success: false,
        error: `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
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
      payTo: config.receivingWallet,
      requiredDeadlineSeconds: config.deadlineSeconds,
      extra: { name: "USDC", token: net.usdcToken },
    });

    accepts.push({
      scheme: "upto",
      network: net.name,
      maxAmountRequired: usdcToAtomic(tier.maxPrice),
      resource: resource ?? "/api/proxy",
      description: `SelfHeal: error analysis + structured fix + retry payload [${tier.name}, token-based]`,
      mimeType: "application/json",
      payTo: config.receivingWallet,
      requiredDeadlineSeconds: config.deadlineSeconds,
      extra: { name: "USDC", token: net.usdcToken },
    });
  }

  return {
    x402Version: 1,
    accepts,
    error: `Payment required for error analysis. Tier: ${tier.name} ($${tier.basePrice}\u2013$${tier.maxPrice} USDC). ${errorMessage}`,
  };
}

// --- Payment Extraction ---

export function extractPaymentProof(
  headers: Record<string, string | string[] | undefined>,
): X402PaymentProof | null {
  const paymentHeader =
    (headers["x-payment"] as string) ??
    (headers["x-payment-response"] as string);

  if (!paymentHeader) return null;

  let scheme: "exact" | "upto" = "exact";
  try {
    const decoded = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8"),
    );
    if (decoded.maxDebitAmount || decoded.scheme === "upto") {
      scheme = "upto";
    }
  } catch {
    // If not base64 JSON, treat as exact
  }

  return { payload: paymentHeader, scheme };
}
