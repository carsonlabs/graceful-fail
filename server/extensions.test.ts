import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectProvider, sanitizeHeaders, analyzeError } from "./llmAnalysis";
import { sendSlackAlert, sendSlackTestMessage } from "./slackAlert";

// ── Provider Detection ────────────────────────────────────────────────────────

describe("detectProvider", () => {
  it("detects OpenAI from api.openai.com", () => {
    expect(detectProvider("https://api.openai.com/v1/chat/completions")).toBe("openai");
  });

  it("detects Anthropic from api.anthropic.com", () => {
    expect(detectProvider("https://api.anthropic.com/v1/messages")).toBe("anthropic");
  });

  it("detects Google Gemini from generativelanguage.googleapis.com", () => {
    expect(detectProvider("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent")).toBe("google");
  });

  it("detects Cohere from api.cohere.ai", () => {
    expect(detectProvider("https://api.cohere.ai/v1/generate")).toBe("cohere");
  });

  it("detects Mistral from api.mistral.ai", () => {
    expect(detectProvider("https://api.mistral.ai/v1/chat/completions")).toBe("mistral");
  });

  it("detects HuggingFace from api-inference.huggingface.co", () => {
    expect(detectProvider("https://api-inference.huggingface.co/models/gpt2")).toBe("huggingface");
  });

  it("detects Azure OpenAI from .openai.azure.com", () => {
    expect(detectProvider("https://myinstance.openai.azure.com/openai/deployments/gpt4/chat/completions")).toBe("azure_openai");
  });

  it("returns 'other' for unknown APIs", () => {
    expect(detectProvider("https://api.stripe.com/v1/charges")).toBe("other");
    expect(detectProvider("https://api.github.com/repos")).toBe("other");
    expect(detectProvider("https://httpbin.org/post")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(detectProvider("https://API.OPENAI.COM/v1/chat/completions")).toBe("openai");
  });
});

// ── Header Sanitization ───────────────────────────────────────────────────────

describe("sanitizeHeaders", () => {
  it("strips authorization headers", () => {
    const result = sanitizeHeaders({ authorization: "Bearer sk-abc123", "content-type": "application/json" });
    expect(result).not.toHaveProperty("authorization");
    expect(result).toHaveProperty("content-type", "application/json");
  });

  it("strips x-api-key", () => {
    const result = sanitizeHeaders({ "x-api-key": "secret", "user-agent": "test-agent" });
    expect(result).not.toHaveProperty("x-api-key");
    expect(result).toHaveProperty("user-agent", "test-agent");
  });

  it("strips cookie and set-cookie", () => {
    const result = sanitizeHeaders({ cookie: "session=abc", "set-cookie": "token=xyz", accept: "application/json" });
    expect(result).not.toHaveProperty("cookie");
    expect(result).not.toHaveProperty("set-cookie");
    expect(result).toHaveProperty("accept");
  });

  it("handles array header values by joining them", () => {
    const result = sanitizeHeaders({ accept: ["application/json", "text/plain"] });
    expect(result.accept).toBe("application/json, text/plain");
  });

  it("handles undefined values", () => {
    const result = sanitizeHeaders({ "x-custom": undefined });
    expect(result["x-custom"]).toBe("");
  });
});

// ── analyzeError — provider attachment ───────────────────────────────────────

describe("analyzeError — provider detection", () => {
  beforeEach(() => {
    vi.mock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                is_retriable: false,
                human_readable_explanation: "Invalid API key",
                actionable_fix_for_agent: "Regenerate your API key",
                suggested_payload_diff: { remove: [], add: {}, modify: {} },
                error_category: "auth",
              }),
            },
          },
        ],
      }),
    }));
  });

  it("attaches detected provider to analysis result", async () => {
    const result = await analyzeError({
      destinationUrl: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      requestHeaders: { "content-type": "application/json" },
      requestBody: { model: "gpt-4o", messages: [] },
      statusCode: 401,
      responseBody: { error: { message: "Incorrect API key provided" } },
    });
    expect(result.provider).toBe("openai");
  });

  it("attaches 'anthropic' provider for Anthropic URLs", async () => {
    const result = await analyzeError({
      destinationUrl: "https://api.anthropic.com/v1/messages",
      method: "POST",
      requestHeaders: {},
      requestBody: {},
      statusCode: 401,
      responseBody: { error: { type: "authentication_error" } },
    });
    expect(result.provider).toBe("anthropic");
  });

  it("falls back gracefully and still attaches provider on LLM failure", async () => {
    vi.mock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    }));
    const result = await analyzeError({
      destinationUrl: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      requestHeaders: {},
      requestBody: {},
      statusCode: 500,
      responseBody: { error: "Internal server error" },
    });
    // Even on fallback, provider should be attached
    expect(result.provider).toBe("openai");
    expect(result.is_retriable).toBe(true);
  });
});

// ── Slack Alert ───────────────────────────────────────────────────────────────

describe("sendSlackAlert", () => {
  it("sends a POST request to the webhook URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendSlackAlert("https://hooks.slack.com/services/T000/B000/test", {
      destinationUrl: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      statusCode: 401,
      errorCategory: "auth",
      explanation: "Invalid API key provided",
      actionableFix: "Regenerate your OpenAI API key",
      provider: "openai",
      apiKeyName: "My Agent Key",
    });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/T000/B000/test");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.attachments).toBeDefined();
    expect(body.attachments[0].blocks).toBeDefined();
  });

  it("returns false when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await sendSlackAlert("https://hooks.slack.com/services/T000/B000/fail", {
      destinationUrl: "https://api.example.com",
      method: "GET",
      statusCode: 500,
      errorCategory: "server_error",
      explanation: "Server error",
      actionableFix: "Retry later",
    });
    expect(result).toBe(false);
  });

  it("returns false when Slack returns non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const result = await sendSlackAlert("https://hooks.slack.com/services/T000/B000/revoked", {
      destinationUrl: "https://api.example.com",
      method: "POST",
      statusCode: 422,
      errorCategory: "validation",
      explanation: "Validation error",
      actionableFix: "Fix the payload",
    });
    expect(result).toBe(false);
  });
});

describe("sendSlackTestMessage", () => {
  it("sends a test message and returns ok:true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await sendSlackTestMessage("https://hooks.slack.com/services/T000/B000/test");
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("includes channel in body when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await sendSlackTestMessage("https://hooks.slack.com/services/T000/B000/test", "#alerts");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe("#alerts");
  });
});
