# SelfHeal

**Self-healing API proxy for AI agents. Pay per fix, not per month.**

[![npm version](https://img.shields.io/npm/v/graceful-fail)](https://www.npmjs.com/package/graceful-fail)
[![PyPI version](https://img.shields.io/pypi/v/graceful-fail)](https://pypi.org/project/graceful-fail/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-selfheal.dev-green)](https://selfheal.dev)

---

Your agent hits a `422`. It has no idea why. It retries the same broken payload five times, burns through your token budget, and crashes.

SelfHeal is an API proxy that intercepts failed requests, analyzes them with an LLM, and returns structured fix instructions — **charging only when the fix succeeds** via [x402](https://x402.org) micropayments (USDC on Base). Successful calls pass through free.

## How It Works

```
Agent → POST /api/x402/proxy → Forward to target API
  ↓ Success (2xx)                    ↓ Failure (4xx/5xx)
  → Free pass-through ($0)          → Return 402 with x402 payment spec
                                     → Agent pays $0.001-$0.005 USDC
                                     → LLM analyzes error
                                     → Structured fix returned
                                     → Payment settled only if heal succeeds
```

No API keys. No signup. No subscriptions.

## Quick Start

### x402 Mode (recommended — no API key needed)

```bash
# Successful request — free pass-through
curl -X POST https://selfheal.dev/api/x402/proxy \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.example.com/users", "method": "GET"}'

# Failed request — returns 402 with payment spec
curl -X POST https://selfheal.dev/api/x402/proxy \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.openai.com/v1/chat/completions", "method": "POST", "body": "{\"model\":\"gpt-4o-mini\"}"}'
```

### Python SDK

```python
from graceful_fail import GracefulFail

gf = GracefulFail()  # No API key needed (x402 mode)
response = gf.post("https://api.example.com/users", json={"name": "Alice"})

if response.healed:
    print(response.error_analysis.actionable_fix_for_agent)
elif response.payment_required:
    print("Payment needed:", response.payment_required)
else:
    print("Success:", response.data)
```

### Node.js / TypeScript

```typescript
import { GracefulFail } from "graceful-fail";

const gf = new GracefulFail({
  onPaymentRequired: async (spec) => {
    // Your x402 payment logic here
    return paymentProof;
  },
});

const resp = await gf.post("https://api.example.com/users", {
  json: { name: "Alice" },
});

if (resp.healed) {
  console.log(resp.errorAnalysis!.actionable_fix_for_agent);
}
```

### Legacy Mode (API key)

```python
# Still works — backward compatible
gf = GracefulFail(api_key="gf_your_key")
resp = gf.post(url, json=payload)
```

## What a Healed Response Looks Like

```json
{
  "healed": true,
  "settled": true,
  "transaction": "0xbf023f9c...",
  "original_status_code": 401,
  "error_analysis": {
    "is_retriable": false,
    "human_readable_explanation": "No API key was provided in the Authorization header.",
    "actionable_fix_for_agent": "Add Authorization header with your OpenAI API key.",
    "suggested_payload_diff": {
      "remove": [],
      "add": {},
      "modify": {}
    },
    "error_category": "auth"
  },
  "meta": {
    "tier": "complex",
    "cost_usdc": 0.003,
    "latency_ms": 3038
  }
}
```

## Pricing

| Scenario | Cost | When |
|----------|------|------|
| **Success (2xx/3xx)** | $0 | Always free |
| **Simple error** (400, 404, 422) | $0.001 USDC | Only on successful heal |
| **Moderate error** (500, 502, 503) | $0.002 USDC | Only on successful heal |
| **Complex error** (429, 403, auth) | $0.003-$0.005 USDC | Only on successful heal |
| **Failed analysis** | $0 | Never charged |

Payments via [x402 protocol](https://x402.org) — USDC on Base. Gasless for payers (EIP-3009).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/x402/proxy` | Proxy request with x402 payment on failure |
| POST | `/api/x402/heal` | Direct error analysis |
| GET | `/api/x402/pricing` | Current pricing tiers |
| GET | `/api/x402/usage` | Usage statistics |
| GET | `/metrics` | Prometheus metrics |
| GET | `/health` | Health check |
| POST | `/api/proxy` | Legacy proxy (API key auth) |

## SDKs

| SDK | Install | Version |
|-----|---------|---------|
| **Python** | `pip install graceful-fail` | 0.4.0 |
| **Python + LangChain** | `pip install 'graceful-fail[langchain]'` | 0.4.0 |
| **Node.js / TypeScript** | `npm install graceful-fail` | 0.4.0 |

Both SDKs support x402 mode (default) and legacy API key mode. LangChain and CrewAI integrations included.

## Features

- **Outcome-based pricing** — pay only when fixes succeed, via x402 micropayments
- **Zero-overhead pass-through** — 2xx/3xx returned verbatim, $0 cost
- **LLM-powered analysis** — structured JSON with fix instructions, payload diffs, error categories
- **Provider-aware** — specialized handling for OpenAI, Anthropic, Google, Cohere, Mistral errors
- **Credential stripping** — auth headers and API keys never reach the LLM
- **Prometheus metrics** — proxy requests, heals, latency, x402 payments, LLM token usage
- **Webhook alerting** — traffic spikes, LLM cost overruns, low heal success rates
- **Response caching** — TTL cache for successful GET requests
- **Dashboard** — API key management, request logs, usage analytics
- **OpenAPI 3.1 spec** — import into Postman or any OpenAPI client

## Self-Hosting

```bash
git clone https://github.com/carsonlabs/graceful-fail.git
cd graceful-fail
npm install
cp .env.example .env    # configure database, LLM keys, x402 wallet
npm run db:push          # run database migrations
npm run dev              # start development server
```

Key environment variables for x402:

```bash
X402_RECEIVING_WALLET=0xYourWalletAddress
X402_NETWORKS=base-sepolia          # or "base" for mainnet
X402_TESTNET=true
ANTHROPIC_API_KEY=sk-ant-...        # for LLM error analysis
```

See `.env.example` for the full list.

## Links

- [Website](https://selfheal.dev)
- [Documentation](https://selfheal.dev/docs)
- [Pricing](https://selfheal.dev/api/x402/pricing)
- [npm](https://www.npmjs.com/package/graceful-fail)
- [PyPI](https://pypi.org/project/graceful-fail/)
- [Changelog](https://selfheal.dev/changelog)
- [Status](https://selfheal.dev/status)

Built by [Freedom Engineers](https://freedomengineers.tech).

---

MIT License
