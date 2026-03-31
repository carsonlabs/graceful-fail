# SelfHeal Demo Plan

## Target audience

Backend/full-stack devs at startups running AI agents in production. They maintain 3-5 agents calling OpenAI, Anthropic, and third-party APIs. When something breaks, they're the ones debugging cryptic error responses at 2am.

## One-liner

"An SRE that sits between your agents and every API, catches failures, explains them in English, and fixes the payload automatically before you even know it broke."

## Demo flow (90 seconds)

### Scene 1 — "This is your life right now" (15s)

Show a terminal. An agent calls OpenAI. It gets a 422 back. The error message is cryptic JSON. This is the moment the developer would normally open their laptop and start debugging.

Script:
- cURL or Python snippet hitting OpenAI with a wrong model name (`gpt-4-turbo` instead of `gpt-4-turbo-preview`) or a malformed messages array
- Show the raw error response — ugly, unhelpful

### Scene 2 — "Now route it through SelfHeal" (30s)

Same request, one header change. Route through SelfHeal proxy.

Show the response:
1. **Plain English explanation** — "You sent `gpt-4-turbo` but the model name is `gpt-4-turbo-preview`"
2. **Exact payload diff** — field-level add/remove/modify with the corrected value
3. **Auto-retry result** — "SelfHeal already retried with the fix. Here's your 200 response."

This is the money shot. The agent broke, SelfHeal fixed it, no human involved.

Options for showing this:
- **Terminal** (cURL) — feels real, developers trust it
- **Playground** — use the built-in 422 quick example, shows the side-by-side response panel with "What went wrong" + "Actionable Fix" + visual diff

### Scene 3 — "And here's the receipt" (30s)

Flip to the dashboard.

- Open **Request Logs**
- Expand the intercepted request row — show the LLM analysis, retriable flag, error category
- Fire a second failure (429 rate limit) to show it handles different error types
- Quick glance at **Overview** stats: "2 intercepted, 1 auto-recovered"

This proves it's not a one-trick demo and the data persists for triage.

### Scene 4 — "Here's what you do" (15s)

Show the integration:
```bash
pip install graceful-fail
```

Show the 3-line code change to route requests through SelfHeal. Done.

## Scripted failures to prepare

| # | Error | API | What SelfHeal should show |
|---|-------|-----|--------------------------|
| 1 | 422 — wrong model name | OpenAI | Plain English explanation + corrected model field + auto-retry success |
| 2 | 429 — rate limit | OpenAI or Anthropic | "Rate limited, retry after backoff" + non-retriable flag + Slack alert mention |
| 3 | 401 — bad auth (backup) | Any | "API key is invalid or expired" + clear next step |

Pick 2 of 3 for the demo. Lead with the 422 (most impressive because auto-retry actually fixes it).

## What to skip

- Webhooks, Slack, Sentry config — integration details, not value
- Usage analytics / billing — figure-it-out-later stuff
- Free scanner — different product, different audience
- Settings pages — nobody demos settings
- Monthly charts — meaningless with no historical data

## What would kill the demo

- Generic LLM analysis ("an error occurred") — the explanation must be API-specific and actionable
- Not showing auto-retry — that's the feature that separates SelfHeal from a fancy error logger
- Taking more than 2 minutes to get to the point
- Showing empty dashboard states before showing the Playground

## Pre-demo checklist

- [ ] App running locally or on selfheal.dev
- [ ] API key created and copied
- [ ] OpenAI API key configured (so LLM analysis works)
- [ ] Test the 422 script — confirm auto-retry returns a 200
- [ ] Test the 429 script — confirm it classifies as rate_limit
- [ ] Request Logs page shows both entries after firing
- [ ] Screen recording tool ready (if async demo / Loom)
- [ ] Browser zoomed to ~125% so text is readable on recording
