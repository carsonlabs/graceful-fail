# graceful-fail

Self-healing API proxy for AI agents. Route your HTTP calls through Graceful Fail and get structured, LLM-powered fix instructions when APIs return errors.

Instead of your agent crashing on a `422` or retrying a `503` blindly, it gets back:

```json
{
  "is_retriable": false,
  "actionable_fix_for_agent": "Remove 'name' field. Add 'first_name' and 'last_name' as separate string fields.",
  "suggested_payload_diff": {
    "remove": ["name"],
    "add": { "first_name": "string", "last_name": "string" }
  },
  "error_category": "validation_error"
}
```

Successful requests (2xx/3xx) pass through with zero overhead. You only pay when the LLM is invoked on a failed request.

## Install

```bash
npm install graceful-fail
```

## Quick Start

```typescript
import { GracefulFail } from "graceful-fail";

const gf = new GracefulFail({ apiKey: "gf_your_key" });

const resp = await gf.post("https://api.example.com/users", {
  json: { name: "Alice" },
});

if (resp.intercepted) {
  // The API returned an error — here's exactly how to fix it
  console.log(resp.errorAnalysis!.actionable_fix_for_agent);
  console.log(resp.errorAnalysis!.suggested_payload_diff);
} else {
  // Success — here's the data
  console.log(resp.data);
}
```

## All HTTP Methods

```typescript
const gf = new GracefulFail({ apiKey: "gf_your_key" });

await gf.get("https://api.example.com/users/1");
await gf.post("https://api.example.com/users", { json: { name: "Alice" } });
await gf.put("https://api.example.com/users/1", { json: { name: "Bob" } });
await gf.patch("https://api.example.com/users/1", { json: { email: "bob@example.com" } });
await gf.delete("https://api.example.com/users/1");
```

## Auto-Apply Fix

When you get an intercepted error, apply the suggested diff and retry:

```typescript
import { GracefulFail, applyDiff } from "graceful-fail";

const gf = new GracefulFail({ apiKey: "gf_your_key" });
const payload = { name: "Alice" };

const resp = await gf.post("https://api.example.com/users", { json: payload });

if (resp.intercepted && resp.errorAnalysis) {
  const fixedPayload = applyDiff(payload, resp.errorAnalysis.suggested_payload_diff);
  const retry = await gf.post("https://api.example.com/users", { json: fixedPayload });
  console.log(retry.data);
}
```

## LangChain.js Integration

```typescript
import { GracefulFailTool } from "graceful-fail/langchain";

const tool = new GracefulFailTool({ apiKey: "gf_your_key" });

// Add to any LangChain agent — it handles all external API calls
// On error, the agent gets structured fix instructions instead of raw HTTP errors
```

Requires `@langchain/core` as a peer dependency.

## Error Handling

```typescript
import { GracefulFail, AuthenticationError, RateLimitError } from "graceful-fail";

const gf = new GracefulFail({ apiKey: "gf_your_key" });

try {
  const resp = await gf.post(url, { json: data });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Invalid API key
  } else if (err instanceof RateLimitError) {
    // Monthly limit exceeded — upgrade tier
  }
}
```

## Response Object

| Field | Type | Description |
|---|---|---|
| `statusCode` | `number` | HTTP status from the destination API |
| `intercepted` | `boolean` | `true` if the error was analyzed by the LLM |
| `data` | `T` | Response body (success) or full error envelope (intercepted) |
| `errorAnalysis` | `ErrorAnalysis` | LLM analysis (only when `intercepted === true`) |
| `rawResponse` | `unknown` | Original destination API response body |
| `creditsUsed` | `number` | 0 for pass-through, 1 for intercepted |
| `durationMs` | `number` | Total proxy round-trip time in milliseconds |

## Get Your API Key

1. Sign up at [selfheal.dev](https://selfheal.dev)
2. Create an API key in the dashboard
3. Free tier: 500 requests/month

## Links

- [Documentation](https://selfheal.dev/docs)
- [Python SDK](https://pypi.org/project/graceful-fail/)
- [Dashboard](https://selfheal.dev/dashboard)
- [Status](https://selfheal.dev/status)
