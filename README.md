# Graceful Fail

**Self-healing API proxy for AI agents.**

[![npm version](https://img.shields.io/npm/v/graceful-fail)](https://www.npmjs.com/package/graceful-fail)
[![PyPI version](https://img.shields.io/pypi/v/graceful-fail)](https://pypi.org/project/graceful-fail/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-selfheal.dev-green)](https://selfheal.dev)

---

Your agent hits a `422`. It has no idea why. It retries the same broken payload five times, burns through your token budget, and crashes. You get a Slack alert at 2am.

Graceful Fail is an API proxy that intercepts failed requests, analyzes them with an LLM, and returns structured fix instructions your agent can act on immediately. Successful calls pass through untouched. Failed calls come back with an explanation and a fix.

<!-- TODO: Add demo GIF or architecture diagram here -->
![Demo](docs/demo.gif)

```json
{
  "graceful_fail_intercepted": true,
  "original_status_code": 422,
  "destination_url": "https://api.example.com/users",
  "error_analysis": {
    "is_retriable": false,
    "human_readable_explanation": "The request body is missing the required 'email' field.",
    "actionable_fix_for_agent": "Add the 'email' field (valid email string) to the request body before retrying.",
    "suggested_payload_diff": {
      "remove": [],
      "add": { "email": "string (valid email address)" },
      "modify": {}
    },
    "error_category": "validation_error"
  },
  "raw_destination_response": {
    "error": "Unprocessable Entity",
    "details": [{ "field": "email", "message": "is required" }]
  },
  "meta": { "credits_used": 1, "duration_ms": 312, "tier": "hobby" }
}
```

## How It Works

1. **Your agent sends API calls through the proxy.** Replace the destination URL with the Graceful Fail endpoint and set `X-Destination-URL` to point at the real API.
2. **Successful responses pass through with zero overhead.** 2xx and 3xx responses are returned verbatim. No credits consumed, no added latency.
3. **Failed responses get LLM-analyzed.** 4xx and 5xx errors are intercepted, analyzed, and returned with structured fix instructions including retriability, error category, and a suggested payload diff.

## Quick Start

### curl

```bash
curl -X POST https://selfheal.dev/api/proxy \
  -H "Authorization: Bearer gf_your_key" \
  -H "X-Destination-URL: https://api.example.com/users" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

### Python

```python
from graceful_fail import GracefulFail

gf = GracefulFail(api_key="gf_your_key")
response = gf.post("https://api.example.com/users", json={"name": "Alice"})

if response.intercepted:
    print(response.error_analysis.actionable_fix_for_agent)
```

### TypeScript / Node.js

```typescript
import { GracefulFail } from "graceful-fail";

const gf = new GracefulFail({ apiKey: "gf_your_key" });
const resp = await gf.post("https://api.example.com/users", {
  json: { name: "Alice" },
});

if (resp.intercepted) {
  console.log(resp.errorAnalysis!.actionable_fix_for_agent);
}
```

## SDKs

| SDK | Install | Package |
|-----|---------|---------|
| **Python** | `pip install graceful-fail` | [PyPI](https://pypi.org/project/graceful-fail/) |
| **Python + LangChain** | `pip install 'graceful-fail[langchain]'` | [PyPI](https://pypi.org/project/graceful-fail/) |
| **Node.js / TypeScript** | `npm install graceful-fail` | [npm](https://www.npmjs.com/package/graceful-fail) |

Both SDKs include framework integrations:

- **LangChain** -- Use `GracefulFailTool` as an agent tool or `GracefulFailRequests` as a drop-in requests wrapper.
- **CrewAI** -- Wrap any external API tool with the Python SDK for structured error recovery.

## Features

- **Zero-overhead pass-through** -- 2xx/3xx responses returned verbatim, no credits consumed
- **LLM-powered error analysis** -- structured JSON envelope with fix instructions, payload diffs, and error categories
- **Provider-aware** -- specialized handling for OpenAI and Anthropic API errors (rate limits, context length, auth)
- **Sensitive data stripped** -- Authorization headers, cookies, and API keys never reach the LLM
- **Webhooks & Slack alerts** -- get notified on rate limits, non-retriable errors, and critical failures
- **Dashboard** -- API key management, request logs with filters, usage analytics, CSV export
- **Weekly digest emails** -- top failing APIs and usage summary delivered to your inbox
- **OpenAPI 3.1 spec** -- import into Postman, Insomnia, or any OpenAPI client

[Full feature list &rarr; selfheal.dev/docs](https://selfheal.dev/docs)

## Pricing

See [Pricing](https://selfheal.dev/#pricing) for plan details. Free tier includes 500 requests/month.

## API Reference

Graceful Fail exposes a single endpoint:

```
POST /api/proxy
```

**Required headers:**

| Header | Description |
|--------|-------------|
| `Authorization` | `Bearer gf_your_key` -- your Graceful Fail API key |
| `X-Destination-URL` | Full URL of the target API endpoint |

**Optional headers:**

| Header | Default | Description |
|--------|---------|-------------|
| `X-Destination-Method` | `POST` | HTTP method for the destination request (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) |

Any additional headers and the request body are forwarded to the destination API.

Full documentation with response schemas and error categories: [selfheal.dev/docs](https://selfheal.dev/docs)

OpenAPI spec: `GET /api/openapi.json`

## Integrations

- [Python SDK](https://pypi.org/project/graceful-fail/) -- sync, async, and `requests`-compatible session
- [npm SDK](https://www.npmjs.com/package/graceful-fail) -- full TypeScript support with `applyDiff` helper
- [LangChain tool](https://pypi.org/project/graceful-fail/) -- `GracefulFailTool` for Python and JS agents
- [CrewAI tool](https://pypi.org/project/graceful-fail/) -- wrap any external API call
- Webhooks -- HMAC-signed delivery with retry logic
- Slack -- Block Kit alerts on non-retriable errors
- OpenAPI 3.1 spec -- import into Postman, Insomnia, or any OpenAPI client

## Self-Hosting

```bash
git clone https://github.com/carsonlabs/graceful-fail.git
cd graceful-fail
npm install
cp .env.example .env    # configure your database, Stripe, and LLM keys
npm run db:push          # run database migrations
npm run dev              # start development server
```

See `.env.example` for the full list of required environment variables.

## Links

- [Website](https://selfheal.dev)
- [Documentation](https://selfheal.dev/docs)
- [Status](https://selfheal.dev/status)
- [Changelog](https://selfheal.dev/changelog)
- [PyPI](https://pypi.org/project/graceful-fail/)
- [npm](https://www.npmjs.com/package/graceful-fail)

---

MIT License
