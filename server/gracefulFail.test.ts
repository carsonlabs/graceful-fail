import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashApiKey } from "./proxyEngine";
import { sanitizeHeaders, analyzeError } from "./llmAnalysis";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Proxy Engine — hashApiKey ─────────────────────────────────────────────────

describe("hashApiKey", () => {
  it("produces a 64-char hex SHA-256 hash", () => {
    const hash = hashApiKey("gf_testkey123");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic for the same input", () => {
    const key = "gf_abc123def456";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("produces different hashes for different keys", () => {
    expect(hashApiKey("gf_key_a")).not.toBe(hashApiKey("gf_key_b"));
  });
});

// ── LLM Analysis — Header Sanitization ───────────────────────────────────────

describe("sanitizeHeaders", () => {
  it("strips Authorization header", () => {
    const result = sanitizeHeaders({
      authorization: "Bearer sk-secret123",
      "content-type": "application/json",
    });
    expect(result).not.toHaveProperty("authorization");
    expect(result["content-type"]).toBe("application/json");
  });

  it("strips Cookie header", () => {
    const result = sanitizeHeaders({
      cookie: "session=abc123",
      accept: "application/json",
    });
    expect(result).not.toHaveProperty("cookie");
    expect(result["accept"]).toBe("application/json");
  });

  it("strips x-api-key header", () => {
    const result = sanitizeHeaders({
      "x-api-key": "secret-api-key",
      "user-agent": "TestAgent/1.0",
    });
    expect(result).not.toHaveProperty("x-api-key");
    expect(result["user-agent"]).toBe("TestAgent/1.0");
  });

  it("strips x-auth-token and x-access-token", () => {
    const result = sanitizeHeaders({
      "x-auth-token": "token123",
      "x-access-token": "access456",
      "content-type": "application/json",
    });
    expect(result).not.toHaveProperty("x-auth-token");
    expect(result).not.toHaveProperty("x-access-token");
    expect(result["content-type"]).toBe("application/json");
  });

  it("handles array header values by joining them", () => {
    const result = sanitizeHeaders({
      accept: ["text/html", "application/json"],
    });
    expect(result["accept"]).toBe("text/html, application/json");
  });

  it("preserves non-sensitive headers", () => {
    const result = sanitizeHeaders({
      "content-type": "application/json",
      "user-agent": "n8n/1.0",
      "x-request-id": "req-123",
    });
    expect(result["content-type"]).toBe("application/json");
    expect(result["user-agent"]).toBe("n8n/1.0");
    expect(result["x-request-id"]).toBe("req-123");
  });

  it("returns empty object for all-sensitive headers", () => {
    const result = sanitizeHeaders({
      authorization: "Bearer token",
      cookie: "session=abc",
      "x-api-key": "key123",
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ── LLM Analysis — analyzeError with mocked invokeLLM ────────────────────────

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
const mockInvokeLLM = vi.mocked(invokeLLM);

describe("analyzeError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured analysis from LLM on success", async () => {
    const mockAnalysis = {
      is_retriable: true,
      human_readable_explanation: "Missing required field 'first_name'",
      actionable_fix_for_agent: "Replace 'name' with 'first_name' and 'last_name' fields",
      suggested_payload_diff: {
        remove: ["name"],
        add: { first_name: "string", last_name: "string" },
        modify: {},
      },
      error_category: "validation",
    };

    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(mockAnalysis) } }],
    } as any);

    const result = await analyzeError({
      destinationUrl: "https://api.example.com/contacts",
      method: "POST",
      requestHeaders: { "content-type": "application/json", authorization: "Bearer secret" },
      requestBody: { name: "John Doe" },
      statusCode: 422,
      responseBody: { detail: [{ msg: "Field required", loc: ["body", "first_name"] }] },
    });

    expect(result.is_retriable).toBe(true);
    expect(result.error_category).toBe("validation");
    expect(result.suggested_payload_diff.remove).toContain("name");
    expect(result.suggested_payload_diff.add).toHaveProperty("first_name");
  });

  it("falls back gracefully when LLM throws", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM service unavailable"));

    const result = await analyzeError({
      destinationUrl: "https://api.example.com/endpoint",
      method: "POST",
      requestHeaders: {},
      requestBody: {},
      statusCode: 422,
      responseBody: { error: "bad request" },
    });

    expect(result.is_retriable).toBe(false); // 422 is not retriable in fallback
    expect(result.human_readable_explanation).toContain("422");
    expect(result.suggested_payload_diff.remove).toHaveLength(0);
  });

  it("marks 500 errors as retriable in fallback", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("timeout"));

    const result = await analyzeError({
      destinationUrl: "https://api.example.com/endpoint",
      method: "POST",
      requestHeaders: {},
      requestBody: {},
      statusCode: 500,
      responseBody: { error: "internal server error" },
    });

    expect(result.is_retriable).toBe(true);
    expect(result.error_category).toBe("server_error");
  });

  it("marks 429 rate limit errors as retriable in fallback", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("timeout"));

    const result = await analyzeError({
      destinationUrl: "https://api.example.com/endpoint",
      method: "POST",
      requestHeaders: {},
      requestBody: {},
      statusCode: 429,
      responseBody: { error: "rate limited" },
    });

    expect(result.is_retriable).toBe(true);
    expect(result.error_category).toBe("rate_limit");
  });

  it("does NOT include sensitive headers in LLM call", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        is_retriable: false,
        human_readable_explanation: "test",
        actionable_fix_for_agent: "test",
        suggested_payload_diff: { remove: [], add: {}, modify: {} },
        error_category: "unknown",
      }) } }],
    } as any);

    await analyzeError({
      destinationUrl: "https://api.example.com/endpoint",
      method: "POST",
      requestHeaders: {
        authorization: "Bearer super-secret-key",
        "x-api-key": "another-secret",
        "content-type": "application/json",
      },
      requestBody: {},
      statusCode: 400,
      responseBody: {},
    });

    const callArgs = mockInvokeLLM.mock.calls[0]?.[0];
    const userMessage = callArgs?.messages?.find((m: any) => m.role === "user")?.content as string;
    expect(userMessage).not.toContain("super-secret-key");
    expect(userMessage).not.toContain("another-secret");
  });
});

// ── tRPC Router — Auth ────────────────────────────────────────────────────────

function createMockContext(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-openid",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledOnce();
  });
});

describe("auth.me", () => {
  it("returns the current user when authenticated", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.id).toBe(1);
    expect(user?.email).toBe("test@example.com");
  });

  it("returns null when not authenticated", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

// ── tRPC Router — apiKeys input validation ────────────────────────────────────

describe("apiKeys.create input validation", () => {
  it("rejects empty key name via zod", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.apiKeys.create({ name: "", tier: "hobby" })
    ).rejects.toThrow();
  });

  it("rejects invalid tier via zod", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error intentionally invalid tier
      caller.apiKeys.create({ name: "Test Key", tier: "enterprise" })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated user", async () => {
    const ctx = createMockContext({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.apiKeys.create({ name: "Test Key", tier: "hobby" })
    ).rejects.toThrow(/login|unauthorized/i);
  });
});
