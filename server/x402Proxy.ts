/**
 * x402-aware proxy handler for Express.
 *
 * Flow:
 *   Agent → POST /api/proxy → Forward to target
 *     ↓ (target succeeds)
 *     → 200 pass-through (FREE)
 *     ↓ (target fails, no API key, no payment)
 *     → 402 with x402 spec
 *     ↓ (target fails, has x402 payment)
 *     → Verify → LLM heal → Settle on success → Return fix
 *     ↓ (target fails, has legacy API key)
 *     → Existing flow (analyzeError + auto-retry) with deprecation notice
 *
 * Reuses the existing analyzeError + invokeLLM pipeline.
 */

import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import {
  type X402Config,
  PricingEngine,
  FacilitatorClient,
  build402Response,
  extractPaymentProof,
  loadX402Config,
} from "./x402";
import { analyzeError, sanitizeHeaders, type AnalysisInput } from "./llmAnalysis";
import { ResponseCache } from "./responseCache";
import { MonitoringRegistry } from "./monitoring";

// --- Rate Limiter ---

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class PaymentAwareRateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private freeLimit: number;
  private paidLimit: number;

  constructor(windowMs = 60_000, freeLimit = 30, paidLimit = 300) {
    this.windowMs = windowMs;
    this.freeLimit = freeLimit;
    this.paidLimit = paidLimit;
  }

  check(ip: string, hasPaid: boolean): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const limit = hasPaid ? this.paidLimit : this.freeLimit;
    let entry = this.limits.get(ip);

    if (!entry || now - entry.windowStart > this.windowMs) {
      entry = { count: 0, windowStart: now };
      this.limits.set(ip, entry);
    }

    entry.count++;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.limits) {
      if (now - entry.windowStart > this.windowMs * 2) {
        this.limits.delete(ip);
      }
    }
  }
}

// --- Helpers ---

function getClientIp(req: Request): string {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    ?? req.ip
    ?? "unknown";
}

function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.startsWith("169.254.") ||
    hostname.startsWith("fe80:") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

// --- x402 Router Factory ---

export interface X402RouterDeps {
  monitor: MonitoringRegistry;
  cache: ResponseCache;
  x402Config?: X402Config;
}

export function createX402Router(deps: X402RouterDeps): {
  router: Router;
  shutdown: () => void;
} {
  const router = createRouter();
  const config = deps.x402Config ?? loadX402Config();
  const pricing = new PricingEngine(config.pricingTiers);
  const facilitator = new FacilitatorClient(config.facilitatorUrl);
  const rateLimiter = new PaymentAwareRateLimiter();
  const { monitor, cache } = deps;

  // Periodic cleanup
  const cleanupTimer = setInterval(() => {
    cache.prune();
    rateLimiter.cleanup();
    const stats = cache.getStats();
    monitor.cacheSize.set(stats.size);
    monitor.cacheHitRate.set(stats.hitRate);
  }, 30_000);

  // ── POST /api/x402/proxy — x402-protected proxy ─────────────────────────
  router.post("/api/x402/proxy", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const hasPayment = !!extractPaymentProof(req.headers);
    const rateCheck = rateLimiter.check(clientIp, hasPayment);

    if (!rateCheck.allowed) {
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfterSeconds: 60,
        hint: hasPayment
          ? "Paid rate limit reached. Try again in 60 seconds."
          : "Free tier rate limit. Include x402 payment proof for higher limits.",
      });
      return;
    }

    // Parse body — expects { url, method?, headers?, body?, timeoutMs? }
    const { url: targetUrl, method: targetMethod, headers: targetHeaders, body: targetBody, timeoutMs } =
      req.body as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeoutMs?: number;
      };

    if (!targetUrl) {
      res.status(400).json({ error: "Missing required field: url" });
      return;
    }

    // SSRF check
    try {
      const parsed = new URL(targetUrl);
      if (isPrivateHost(parsed.hostname)) {
        res.status(400).json({ error: "Requests to internal/loopback addresses are not allowed." });
        return;
      }
    } catch {
      res.status(400).json({ error: `Invalid url: "${targetUrl}" is not a valid URL.` });
      return;
    }

    const method = (targetMethod ?? "GET").toUpperCase();
    monitor.proxyRequests.inc({ method });
    monitor.recordRequest();
    monitor.activeRequests.inc();

    const start = Date.now();

    try {
      // Check cache
      const cacheKey = ResponseCache.buildKey(method, targetUrl, targetBody);
      const cached = cache.get(cacheKey);
      if (cached) {
        monitor.proxySuccesses.inc();
        res.setHeader("X-SelfHeal-Cache", "HIT");
        res.setHeader("X-SelfHeal-Latency", String(Date.now() - start));
        res.json(cached);
        return;
      }

      // Forward to target
      const timeout = timeoutMs ?? 30_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let targetResponse: globalThis.Response;
      try {
        targetResponse = await fetch(targetUrl, {
          method,
          headers: targetHeaders ?? {},
          body: targetBody ?? undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const latency = Date.now() - start;
      monitor.proxyLatency.observe(latency);

      // SUCCESS — free pass-through
      if (targetResponse.ok) {
        monitor.proxySuccesses.inc();
        const responseBody = await targetResponse.text();
        const result = {
          status: targetResponse.status,
          headers: Object.fromEntries(targetResponse.headers.entries()),
          body: responseBody.length > 100_000
            ? responseBody.slice(0, 100_000) + "\n...[truncated]"
            : responseBody,
        };

        if (method === "GET") {
          cache.set(cacheKey, result);
        }

        res.setHeader("X-SelfHeal-Status", "pass-through");
        res.setHeader("X-SelfHeal-Latency", String(latency));
        res.setHeader("X-SelfHeal-Cost", "0");
        res.json(result);
        return;
      }

      // FAILURE — check for x402 payment
      monitor.proxyFailures.inc({ status: String(targetResponse.status) });
      const errorBody = await targetResponse.text();
      const paymentProof = extractPaymentProof(req.headers);

      if (!paymentProof) {
        // No payment — return 402 with pricing spec
        if (!config.receivingWallet) {
          // x402 not configured — return plain error
          res.status(targetResponse.status).json({
            error: "Target API returned an error",
            status: targetResponse.status,
            body: errorBody.slice(0, 2000),
            hint: "x402 payments not configured on this server.",
          });
          return;
        }

        const paymentRequired = build402Response(
          config,
          pricing,
          errorBody.slice(0, 500),
          targetResponse.status,
          targetUrl,
        );
        res.status(402).json(paymentRequired);
        return;
      }

      // PAID PATH — verify → heal → settle on success
      const tier = pricing.getTier(errorBody, targetResponse.status);
      const expectedAmount = Math.round(tier.basePrice * 1_000_000).toString();

      const verification = await facilitator.verify(
        paymentProof.payload,
        expectedAmount,
        config.receivingWallet,
      );

      if (!verification.valid) {
        res.status(402).json({
          error: "Payment verification failed",
          reason: verification.invalidReason,
          hint: "Ensure payment proof is valid and meets the required amount.",
        });
        return;
      }

      monitor.x402Payments.inc({ scheme: paymentProof.scheme });

      // Run LLM heal analysis using the existing analyzeError pipeline
      monitor.healRequests.inc({ status: String(targetResponse.status) });
      const healStart = Date.now();

      const analysisInput: AnalysisInput = {
        destinationUrl: targetUrl,
        method,
        requestHeaders: targetHeaders ?? {},
        requestBody: targetBody ? safeJsonParse(targetBody) : undefined,
        statusCode: targetResponse.status,
        responseBody: safeJsonParse(errorBody) ?? errorBody,
      };

      try {
        const analysis = await analyzeError(analysisInput);
        const healLatency = Date.now() - healStart;
        monitor.healLatency.observe(healLatency);

        // Settle payment only on successful analysis
        monitor.healSuccesses.inc();
        const settleResult = await facilitator.settle(
          paymentProof.payload,
          config.receivingWallet,
        );

        if (settleResult.success) {
          monitor.x402Revenue.inc({ tier: tier.name }, parseInt(expectedAmount));
        }

        res.setHeader("X-SelfHeal-Status", "healed");
        res.setHeader("X-SelfHeal-Cost", `$${tier.basePrice} USDC`);
        res.setHeader("X-SelfHeal-Latency", String(healLatency));
        res.json({
          healed: true,
          settled: settleResult.success,
          txHash: settleResult.txHash,
          original_status_code: targetResponse.status,
          error_analysis: analysis,
          raw_destination_response: safeJsonParse(errorBody) ?? errorBody,
          meta: {
            tier: tier.name,
            cost_usdc: tier.basePrice,
            latency_ms: healLatency,
          },
        });
      } catch (err) {
        // LLM failed — don't settle payment
        monitor.healFailures.inc();
        monitor.x402Refunds.inc();

        res.status(502).json({
          error: "Heal analysis failed",
          reason: err instanceof Error ? err.message : String(err),
          refunded: true,
          hint: "Payment was NOT settled. You were not charged.",
        });
      }
    } finally {
      monitor.activeRequests.dec();
    }
  });

  // ── POST /api/x402/heal — direct heal endpoint ──────────────────────────
  router.post("/api/x402/heal", async (req: Request, res: Response) => {
    const paymentProof = extractPaymentProof(req.headers);

    if (!paymentProof) {
      const { errorBody, statusCode } = req.body as { errorBody?: string; statusCode?: number };
      if (!config.receivingWallet) {
        res.status(503).json({ error: "x402 payments not configured on this server." });
        return;
      }
      const paymentRequired = build402Response(
        config,
        pricing,
        errorBody ?? "Unknown error",
        statusCode ?? 500,
        "/api/x402/heal",
      );
      res.status(402).json(paymentRequired);
      return;
    }

    const { url, method, headers, body, statusCode, errorBody, errorHeaders } = req.body as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      statusCode?: number;
      errorBody?: string;
      errorHeaders?: Record<string, string>;
    };

    if (!url || !statusCode || !errorBody) {
      res.status(400).json({
        error: "Missing required fields",
        expected: { url: "string", statusCode: "number", errorBody: "string" },
      });
      return;
    }

    // Verify payment
    const tier = pricing.getTier(errorBody, statusCode);
    const expectedAmount = Math.round(tier.basePrice * 1_000_000).toString();

    const verification = await facilitator.verify(
      paymentProof.payload,
      expectedAmount,
      config.receivingWallet,
    );

    if (!verification.valid) {
      res.status(402).json({
        error: "Payment verification failed",
        reason: verification.invalidReason,
      });
      return;
    }

    monitor.x402Payments.inc({ scheme: paymentProof.scheme });
    monitor.healRequests.inc({ status: String(statusCode) });

    try {
      const analysis = await analyzeError({
        destinationUrl: url,
        method: method ?? "GET",
        requestHeaders: headers ?? {},
        requestBody: body ? safeJsonParse(body) : undefined,
        statusCode,
        responseBody: safeJsonParse(errorBody) ?? errorBody,
      });

      monitor.healSuccesses.inc();
      const settleResult = await facilitator.settle(
        paymentProof.payload,
        config.receivingWallet,
      );

      res.json({
        healed: true,
        settled: settleResult.success,
        txHash: settleResult.txHash,
        error_analysis: analysis,
      });
    } catch (err) {
      monitor.healFailures.inc();
      monitor.x402Refunds.inc();

      res.status(502).json({
        error: "Heal analysis failed",
        reason: err instanceof Error ? err.message : String(err),
        refunded: true,
      });
    }
  });

  // ── GET /api/x402/pricing — current pricing tiers ───────────────────────
  router.get("/api/x402/pricing", (_req: Request, res: Response) => {
    res.json({
      model: "outcome-based",
      description: "Pay only when errors are successfully healed. Successes pass through free.",
      currency: "USDC",
      networks: config.networks,
      tiers: pricing.getAllTiers().map(({ name, basePrice, maxPrice }) => ({
        name,
        basePrice,
        maxPrice,
      })),
      protocol: "x402",
      facilitator: config.facilitatorUrl,
    });
  });

  // ── GET /api/x402/usage — public usage stats ────────────────────────────
  router.get("/api/x402/usage", (_req: Request, res: Response) => {
    res.json(monitor.getUsageSummary());
  });

  // ── GET /metrics — Prometheus scrape endpoint ───────────────────────────
  router.get("/metrics", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(monitor.toPrometheus());
  });

  // ── GET /health — health check ──────────────────────────────────────────
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "selfheal",
      x402Enabled: !!config.receivingWallet,
      timestamp: new Date().toISOString(),
    });
  });

  return {
    router,
    shutdown: () => clearInterval(cleanupTimer),
  };
}

// --- Utility ---

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}
