import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GracefulFail } from "../src/client.js";
import { AuthenticationError, RateLimitError, ProxyError } from "../src/errors.js";
import { applyDiff } from "../src/utils.js";

const API_KEY = "gf_test_key_123";
const PROXY_URL = "https://selfheal.dev/api/proxy";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  });
}

describe("GracefulFail", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws if apiKey is empty", () => {
    expect(() => new GracefulFail({ apiKey: "" })).toThrow("apiKey is required");
  });

  it("passes through successful responses", async () => {
    const data = { id: 42, name: "Alice" };
    globalThis.fetch = mockFetch(200, data);

    const gf = new GracefulFail({ apiKey: API_KEY });
    const resp = await gf.get("https://api.example.com/users/42");

    expect(resp.statusCode).toBe(200);
    expect(resp.intercepted).toBe(false);
    expect(resp.data).toEqual(data);
    expect(resp.errorAnalysis).toBeUndefined();
    expect(resp.creditsUsed).toBe(0);
  });

  it("returns intercepted error with analysis", async () => {
    const envelope = {
      graceful_fail_intercepted: true,
      original_status_code: 422,
      destination_url: "https://api.example.com/users",
      error_analysis: {
        is_retriable: false,
        human_readable_explanation: "Missing email field",
        actionable_fix_for_agent: "Add email field",
        suggested_payload_diff: { remove: [], add: { email: "string" }, modify: {} },
        error_category: "validation_error",
      },
      raw_destination_response: { error: "Validation failed" },
      meta: { credits_used: 1, duration_ms: 250, tier: "hobby" },
    };
    globalThis.fetch = mockFetch(422, envelope);

    const gf = new GracefulFail({ apiKey: API_KEY });
    const resp = await gf.post("https://api.example.com/users", {
      json: { name: "Alice" },
    });

    expect(resp.intercepted).toBe(true);
    expect(resp.statusCode).toBe(422);
    expect(resp.errorAnalysis?.error_category).toBe("validation_error");
    expect(resp.errorAnalysis?.actionable_fix_for_agent).toBe("Add email field");
    expect(resp.rawResponse).toEqual({ error: "Validation failed" });
    expect(resp.creditsUsed).toBe(1);
  });

  it("throws AuthenticationError on 401", async () => {
    globalThis.fetch = mockFetch(401, { error: "Invalid API key" });

    const gf = new GracefulFail({ apiKey: "gf_bad" });
    await expect(gf.get("https://api.example.com")).rejects.toThrow(AuthenticationError);
  });

  it("throws RateLimitError on 429", async () => {
    globalThis.fetch = mockFetch(429, { error: "Rate limit exceeded" });

    const gf = new GracefulFail({ apiKey: API_KEY });
    await expect(gf.get("https://api.example.com")).rejects.toThrow(RateLimitError);
  });

  it("throws ProxyError on 502", async () => {
    globalThis.fetch = mockFetch(502, { error: "Proxy error" });

    const gf = new GracefulFail({ apiKey: API_KEY });
    await expect(gf.get("https://api.example.com")).rejects.toThrow(ProxyError);
  });

  it("sends correct headers", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    globalThis.fetch = fetchMock;

    const gf = new GracefulFail({ apiKey: API_KEY });
    await gf.post("https://api.example.com/data", {
      json: { key: "value" },
      headers: { "X-Custom": "test" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PROXY_URL);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers["X-Destination-URL"]).toBe("https://api.example.com/data");
    expect(init.headers["X-Destination-Method"]).toBe("POST");
    expect(init.headers["X-Custom"]).toBe("test");
    expect(init.body).toBe('{"key":"value"}');
  });

  it("supports all HTTP methods", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    globalThis.fetch = fetchMock;

    const gf = new GracefulFail({ apiKey: API_KEY });

    await gf.get("https://api.example.com/a");
    await gf.post("https://api.example.com/b");
    await gf.put("https://api.example.com/c");
    await gf.patch("https://api.example.com/d");
    await gf.delete("https://api.example.com/e");

    const methods = fetchMock.mock.calls.map(
      ([, init]: [string, RequestInit]) => init.headers["X-Destination-Method" as keyof HeadersInit],
    );
    expect(methods).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  });
});

describe("applyDiff", () => {
  it("removes, adds, and modifies fields", () => {
    const result = applyDiff(
      { name: "Alice", email: "wrong" },
      {
        remove: ["name"],
        add: { first_name: "Jane" },
        modify: { email: "alice@example.com" },
      },
    );

    expect(result).toEqual({
      email: "alice@example.com",
      first_name: "Jane",
    });
  });

  it("overwrites existing keys on add (values are exact)", () => {
    const result = applyDiff(
      { email: "old@example.com" },
      { remove: [], add: { email: "new@example.com" }, modify: {} },
    );
    expect(result.email).toBe("new@example.com");
  });

  it("supports dot-notation for nested fields", () => {
    const result = applyDiff(
      { user: { name: "Alice", age: 30 }, tags: ["a", "b"] },
      {
        remove: ["user.age"],
        add: { "user.role": "admin" },
        modify: { "user.name": "Bob" },
      },
    );
    expect(result).toEqual({
      user: { name: "Bob", role: "admin" },
      tags: ["a", "b"],
    });
  });
});
