import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock DB ───────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null), // DB unavailable in unit tests
  };
});

// ── Mock Stripe ───────────────────────────────────────────────────────────────
vi.mock("stripe", () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/test-session-url",
          id: "cs_test_123",
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/test-portal-url",
        }),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return { default: vi.fn(() => mockStripe) };
});

// ── Mock webhook engine ───────────────────────────────────────────────────────
vi.mock("./webhookEngine", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function createMockContext(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "test-openid",
      email: "dev@example.com",
      name: "Dev User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: { origin: "https://app.example.com" } } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

// ── Billing router ────────────────────────────────────────────────────────────

describe("billing.status", () => {
  it("returns null when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.billing.status();
    expect(result).toBeNull();
  });

  it("throws UNAUTHORIZED when user is not logged in", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.billing.status()).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("billing.createCheckout", () => {
  it("returns a Stripe checkout URL for pro tier", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.billing.createCheckout({
      tier: "pro",
      origin: "https://app.example.com",
    });
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/test-session-url");
  });

  it("returns a Stripe checkout URL for agency tier", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.billing.createCheckout({
      tier: "agency",
      origin: "https://app.example.com",
    });
    expect(result.checkoutUrl).toBeDefined();
  });

  it("rejects invalid tier", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error intentionally invalid
      caller.billing.createCheckout({ tier: "enterprise", origin: "https://app.example.com" })
    ).rejects.toThrow();
  });

  it("rejects invalid origin URL", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.billing.createCheckout({ tier: "pro", origin: "not-a-url" })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.billing.createCheckout({ tier: "pro", origin: "https://app.example.com" })
    ).rejects.toThrow(/login|unauthorized/i);
  });
});

// ── Webhooks router ───────────────────────────────────────────────────────────

describe("webhooks.list", () => {
  it("returns empty array when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.webhooks.list();
    expect(result).toEqual([]);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.webhooks.list()).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("webhooks.create input validation", () => {
  it("rejects invalid URL", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.webhooks.create({ url: "not-a-url", events: ["all"] })
    ).rejects.toThrow();
  });

  it("rejects empty events array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.webhooks.create({ url: "https://example.com/hook", events: [] })
    ).rejects.toThrow();
  });

  it("rejects invalid event type", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error intentionally invalid
      caller.webhooks.create({ url: "https://example.com/hook", events: ["invalid_event"] })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.webhooks.create({ url: "https://example.com/hook", events: ["all"] })
    ).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("webhooks.delete input validation", () => {
  it("rejects non-positive id", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.webhooks.delete({ id: 0 })).rejects.toThrow();
    await expect(caller.webhooks.delete({ id: -1 })).rejects.toThrow();
  });
});

describe("webhooks.toggle input validation", () => {
  it("rejects non-positive id", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.webhooks.toggle({ id: 0, isActive: true })).rejects.toThrow();
  });
});

// ── Webhook engine — signature ────────────────────────────────────────────────
import { createHmac } from "crypto";

describe("webhook signature", () => {
  it("HMAC-SHA256 signature is deterministic", () => {
    const secret = "whsec_test123";
    const payload = JSON.stringify({ event: "rate_limit", data: {} });
    const sig1 = createHmac("sha256", secret).update(payload).digest("hex");
    const sig2 = createHmac("sha256", secret).update(payload).digest("hex");
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  it("different payloads produce different signatures", () => {
    const secret = "whsec_test123";
    const sig1 = createHmac("sha256", secret).update("payload1").digest("hex");
    const sig2 = createHmac("sha256", secret).update("payload2").digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("different secrets produce different signatures for same payload", () => {
    const payload = "same-payload";
    const sig1 = createHmac("sha256", "secret1").update(payload).digest("hex");
    const sig2 = createHmac("sha256", "secret2").update(payload).digest("hex");
    expect(sig1).not.toBe(sig2);
  });
});

// ── Onboarding router ─────────────────────────────────────────────────────────

describe("dashboard.onboarding", () => {
  it("returns default false values when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.onboarding();
    expect(result).toEqual({
      hasApiKey: false,
      hasMadeRequest: false,
      hasWebhook: false,
      isDismissed: false,
    });
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.onboarding()).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("dashboard.dismissOnboarding", () => {
  it("returns success when DB is unavailable (no-op)", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.dismissOnboarding();
    expect(result).toEqual({ success: true });
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.dismissOnboarding()).rejects.toThrow(/login|unauthorized/i);
  });
});

// ── CSV export router ─────────────────────────────────────────────────────────

describe("dashboard.exportLogs", () => {
  it("returns empty CSV with header when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.exportLogs({ interceptedOnly: false });
    expect(result.count).toBe(0);
    expect(result.csv).toContain("id,method,destinationUrl");
  });

  it("returns CSV with only intercepted logs when interceptedOnly=true", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.exportLogs({ interceptedOnly: true });
    expect(result.count).toBe(0);
    expect(result.csv).toContain("id,method,destinationUrl");
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.exportLogs({ interceptedOnly: false })).rejects.toThrow(
      /login|unauthorized/i
    );
  });
});

// ── Referral router ───────────────────────────────────────────────────────────

describe("referrals.getCode", () => {
  it("returns null code when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.getCode();
    expect(result).toEqual({ code: null });
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.referrals.getCode()).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("referrals.getStats", () => {
  it("returns zero stats when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.getStats();
    expect(result.totalReferrals).toBe(0);
    expect(result.bonusCreditsEarned).toBe(0);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.referrals.getStats()).rejects.toThrow(/login|unauthorized/i);
  });
});

describe("referrals.redeem", () => {
  it("returns invalid_code when DB is unavailable", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.redeem({ code: "TESTCODE", newUserId: 99 });
    expect(result.success).toBe(false);
  });

  it("rejects empty code", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.referrals.redeem({ code: "", newUserId: 1 })).rejects.toThrow();
  });
});

describe("referrals.getBonusBalance", () => {
  it("returns zero balance when DB is unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.getBonusBalance();
    expect(result.balance).toBe(0);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.referrals.getBonusBalance()).rejects.toThrow(/login|unauthorized/i);
  });
});

// ── Playground webhook dry-run ────────────────────────────────────────────────

describe("playground.webhookDryRun", () => {
  it("rejects invalid URL", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.playground.webhookDryRun({ url: "not-a-url" })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.playground.webhookDryRun({ url: "https://example.com/hook" })
    ).rejects.toThrow(/login|unauthorized/i);
  });

  it("accepts valid URL and optional payload", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    // This will fail to connect but should return a structured error response
    const result = await caller.playground.webhookDryRun({
      url: "https://httpbin.org/post",
      payload: JSON.stringify({ test: true }),
    });
    // Either success or connection failure — both are valid structured responses
    expect(typeof result.statusCode).toBe("number");
    expect(typeof result.responseMs).toBe("number");
    expect(typeof result.responseBody).toBe("string");
  });
});
