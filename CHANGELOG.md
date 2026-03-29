# Changelog

All notable changes to SelfHeal (graceful-fail) will be documented in this file.

## [Unreleased] — 2026-03-29

### Added
- **Auto-Retry with Fixed Payload** — When the LLM diagnoses a retriable error and returns a `suggested_payload_diff`, SelfHeal now automatically applies the diff to the original request body and retries the destination API call. If the retry succeeds, the caller receives a transparent success response with `selfheal_auto_fixed: true` metadata. This is the core differentiator — no other tool in the market does this.
  - Max 1 retry per request (no loops)
  - Only retries when `is_retriable === true` and the diff has actual changes
  - Opt-out with `X-Auto-Retry: false` header
  - Retried requests include `X-SelfHeal-Retry: 1` header for destination awareness
  - Supports dot-notation keys for nested payload fields (e.g. `messages.0.role`)

- **Sentry Inbound Webhook** (`POST /api/webhooks/sentry`) — Receives Sentry issue/event webhook payloads, verifies HMAC signatures, extracts stack traces + breadcrumbs, normalizes into the LLM analysis format, and stores the diagnosis. Enables the "observe → fix" pipeline with Sentry's 100K+ org install base.

- **Sentry Integration Management** — tRPC router for setting up/toggling/deleting Sentry integrations with auto-generated webhook secrets.

- **Request log tracking** — New columns: `wasAutoRetried`, `retrySucceeded`, `retryStatusCode`, `source` (proxy/sentry/future integrations).

- **Competitive analysis** — Perplexity research doc covering 24 competitors stored at `content/selfheal_competitive_analysis.pdf`. Validates the empty "AI Agent Specific + Auto-Remediate" quadrant.

### Changed
- **LLM prompt tightened** — System prompt now demands exact JSON values in `suggested_payload_diff` (not descriptions like "set to 1024"). Schema updated to accept any JSON type in add/modify fields, not just strings.
- **npm SDK** (graceful-fail) — Added `autoRetry` option (default: true), `autoFixed` field on responses, `appliedDiff` field, `AutoFixedEnvelope` type.
- **Python SDK** (graceful-fail) — Added `auto_retry` param on sync/async clients, `auto_fixed` field, `applied_diff` field, `from_auto_fixed()` class method. Payload diff types updated to `Dict[str, Any]`.

### Database Migration Required
- `requestLogs` table: add `wasAutoRetried` (boolean), `retrySucceeded` (boolean nullable), `retryStatusCode` (int nullable), `source` (varchar, default "proxy")
- New table: `sentry_integrations` (userId, webhookSecret, projectSlug, enabled, timestamps)

## [0.2.0] — 2026-03-27

### Added
- BYOLLM support (X-LLM-API-Key, X-LLM-Model, X-LLM-Base-URL headers)
- Python SDK published to PyPI (graceful-fail 0.2.0)
- npm SDK published (graceful-fail 0.2.0)
- n8n community node
- GitHub Action
- CrewAI tool integration
- Slack integration (webhook alerts for non-retriable errors)
- Webhook system (outbound HMAC-signed webhooks)
- Email sequence system
- Badge SVG at /badge.svg
- Mobile responsive dashboard
- Request log drill-down view
- Referral system
- Playground page
- Weekly digest emails

### Changed
- Domain rebrand: graceful-fail-production.up.railway.app → selfheal.dev
- Dashboard: "Success Rate" → "Pass-through Rate"
- Analytics date grouping fix (aggregated by month across API keys)

## [0.1.0] — 2026-03-26

### Added
- Initial release: AI agent API proxy with LLM-powered error analysis
- Provider detection (OpenAI, Anthropic, Google, Cohere, Mistral, HuggingFace, Azure OpenAI)
- Structured error analysis with actionable fix instructions
- API key management with tier-based rate limiting (hobby/pro/agency)
- Dashboard with usage analytics
- Stripe billing integration
