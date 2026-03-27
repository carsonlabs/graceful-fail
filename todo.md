# Graceful Fail — Project TODO

## Database & Schema
- [x] api_keys table (id, userId, name, key hash, tier, isActive, createdAt)
- [x] request_logs table (id, apiKeyId, destinationUrl, method, statusCode, wasIntercepted, llmUsed, creditsUsed, durationMs, errorSummary, createdAt)
- [x] usage_stats table (id, apiKeyId, month, totalRequests, interceptedRequests, creditsUsed)

## Server — Core Proxy Engine
- [x] POST /api/proxy endpoint (Express raw route, not tRPC — needs raw body access)
- [x] Forward request to X-Destination-URL with X-Destination-Method
- [x] Pass-through 2xx/3xx responses with zero overhead
- [x] Intercept 4xx/5xx responses and route to LLM analysis
- [x] Strip sensitive headers (Authorization, Cookie, X-API-Key) before LLM analysis
- [x] Return standardized Graceful Fail JSON envelope on errors

## Server — LLM Analysis Module
- [x] Build structured prompt with: original payload, destination URL, method, error response body
- [x] Call invokeLLM with JSON schema response_format
- [x] Return: is_retriable, human_readable_explanation, actionable_fix_for_agent, suggested_payload_diff
- [x] Handle LLM failures gracefully (fallback to raw error passthrough)

## Server — API Key Auth & Rate Limiting
- [x] API key generation (nanoid, hashed storage)
- [x] Middleware: validate key on every /api/proxy request
- [x] Rate limiting per tier: Hobby (500 req/mo), Pro (10k req/mo), Agency (50k req/mo)
- [x] Credit deduction only on intercepted (failed) requests
- [x] tRPC: createApiKey, listApiKeys, revokeApiKey, getUsage procedures

## Server — tRPC Routers
- [x] proxy router: getRequestLogs, getUsageSummary
- [x] apiKeys router: create, list, revoke
- [x] dashboard router: getStats (total requests, intercepted, credits used, success rate)

## Frontend — Landing Page
- [x] Hero section with product pitch and CTA
- [x] Feature highlights (proxy, LLM analysis, security, pricing)
- [x] Pricing tier cards (Hobby/Pro/Agency)
- [x] Login CTA

## Frontend — Dashboard
- [x] DashboardLayout with sidebar nav
- [x] Overview page: stats cards (total requests, intercepted, credits used, success rate)
- [x] API Keys page: list keys, create new key, copy key, revoke key
- [x] Request Logs page: table with filters (status, date, intercepted only)
- [x] Usage page: monthly usage chart per key

## Tests
- [x] Proxy engine unit test (mock destination API, verify pass-through and intercept)
- [x] API key auth middleware test
- [x] LLM analysis module test (mock invokeLLM)
- [x] tRPC router tests for apiKeys and dashboard

## Stripe Billing
- [x] Add Stripe feature scaffold via webdev_add_feature
- [x] DB: subscriptions table (userId, stripeCustomerId, stripeSubscriptionId, tier, status, currentPeriodEnd)
- [x] Server: create Stripe checkout session for Pro/Agency upgrade
- [x] Server: Stripe webhook handler (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted)
- [x] Server: sync subscription tier to api_keys on upgrade/downgrade
- [x] Frontend: Upgrade modal/page with tier comparison and Stripe checkout redirect
- [x] Frontend: Billing status card in dashboard showing current plan and next renewal

## Webhook Notifications
- [x] DB: webhook_endpoints table (id, userId, url, secret, events[], isActive, createdAt)
- [x] DB: webhook_deliveries table (id, endpointId, event, payload, statusCode, attempts, lastAttemptAt)
- [x] Server: webhook delivery engine (send POST with HMAC-SHA256 signature)
- [x] Server: retry logic (3 attempts with exponential backoff)
- [x] Server: trigger webhooks on rate_limit and non-retriable error events from proxy engine
- [x] tRPC: createWebhook, listWebhooks, deleteWebhook, testWebhook procedures
- [x] Frontend: Webhook settings page (add endpoint, list, delete, test)
- [x] Frontend: Webhook delivery log per endpoint

## Live API Playground
- [x] Frontend: Playground page with destination URL, method, headers, body inputs
- [x] Frontend: Send request through /api/proxy and display structured response
- [x] Frontend: Diff viewer for suggested_payload_diff
- [x] Frontend: Copy-to-clipboard for corrected payload
- [x] Add Playground to sidebar nav

## Public API Docs Page
- [x] /docs route — public-facing, no auth required
- [x] Hero section with endpoint reference (POST /api/proxy)
- [x] Required headers table (Authorization, X-Destination-URL, X-Destination-Method)
- [x] Full JSON response schema for intercepted errors and pass-through
- [x] Code snippet generator with tabs: curl, Python, Node.js, TypeScript
- [x] Error category reference table
- [x] Link from landing page and dashboard sidebar

## Email Alerts for Failed Webhook Deliveries
- [x] Server: detect all-retries-exhausted in webhookEngine.ts
- [x] Server: call notifyOwner when delivery fails all 3 attempts
- [x] Include endpoint URL, event type, last HTTP status in notification

## Copy as cURL in Playground
- [x] Add "Copy as cURL" button to Playground request panel
- [x] Build curl command string from current method, URL, headers, body, and API key
- [x] Toast confirmation on copy

## OpenAPI Spec
- [x] Server: GET /api/openapi.json returns OpenAPI 3.1 spec
- [x] Spec covers POST /api/proxy with all headers, request body, and both response schemas
- [x] Spec includes security scheme (Bearer token)
- [x] Docs page: link to download raw JSON and import instructions for Postman/Insomnia

## Shareable Playground Links
- [x] Encode method, destinationUrl, body, extraHeaders into URL query params on change
- [x] Decode and pre-fill state from URL query params on mount
- [x] Add "Share" button that copies the current URL to clipboard
- [x] Toast confirmation on share copy

## Public Status Page
- [x] /status route — public, no auth required
- [x] tRPC publicProcedure: getStatus — returns aggregate latency and request stats from request_logs
- [x] Show: total requests (24h), avg proxy latency (24h), avg LLM analysis time (24h), error interception rate
- [x] Show: system status indicator (operational / degraded)
- [x] Link from landing page nav and docs page

## Changelog Page
- [x] /changelog route — public, no auth required
- [x] Date-stamped release entries with version tags and feature descriptions
- [x] Link from landing page nav, Docs nav, and dashboard sidebar

## Onboarding Checklist
- [x] tRPC: getOnboardingStatus — checks if user has API key, made a request, set up a webhook
- [x] Dismissible checklist card on Dashboard Overview page
- [x] Steps: Create API key, Make test request in Playground, Set up a webhook, Upgrade to Pro
- [x] Persist dismissed state per user in DB

## CSV Log Export
- [x] Server: tRPC exportLogs procedure — returns all logs for user as CSV string
- [x] Frontend: Export CSV button on Request Logs page
- [x] Apply current interceptedOnly filter to export
- [x] Trigger browser download via Blob URL

## Referral / Invite Link System
- [x] DB: referrals table (id, referrerId, referredUserId, code, bonusCreditsAwarded, createdAt)
- [x] DB: bonus_credits table (id, userId, credits, reason, createdAt)
- [x] Server: generate unique referral code per user
- [x] Server: tRPC getReferralCode, getReferralStats procedures
- [x] Server: apply 100 bonus credits to both parties on successful referral signup
- [x] Frontend: Referral page at /dashboard/referral with shareable link + stats
- [x] Frontend: Link in sidebar under Account section

## Dark/Light Theme Toggle
- [x] Theme toggle button in dashboard sidebar (bottom)
- [x] Theme toggle button in landing page nav
- [x] Persist theme choice in localStorage
- [x] Ensure all pages (Docs, Status, Changelog) respect theme

## Webhook Dry-Run Tester in Playground
- [x] Add "Test Webhook" tab/section to Playground page
- [x] Input: target webhook URL + optional custom payload override
- [x] Server: tRPC testWebhookDryRun procedure — POST sample payload to URL, return status + response body
- [x] Frontend: Show HTTP status, response time, and response body
- [x] Pre-fill with sample non_retriable_error payload

## Product Extensions

### OpenAI/Anthropic Error Specialization
- [x] Detect provider from destination URL (api.openai.com, api.anthropic.com, etc.)
- [x] Provider-aware LLM prompt templates with model-specific fix suggestions
- [x] OpenAI: handle 429 rate limit (RPM/TPM), 401 invalid key, 400 context length, 500 overloaded
- [x] Anthropic: handle 529 overloaded, 400 prompt too long, 401 invalid x-api-key
- [x] Return provider name and model hint in response envelope
- [x] Frontend: show provider badge on request log entries

### Slack Integration
- [x] DB: slack_integrations table (userId, webhookUrl, channel, enabled, createdAt)
- [x] Server: tRPC saveSlackWebhook, getSlackConfig, testSlackWebhook, deleteSlackWebhook
- [x] Server: sendSlackAlert helper with rich Block Kit message
- [x] Proxy engine: fire Slack alert on non_retriable_error events
- [x] Frontend: Slack settings page at /dashboard/integrations/slack
- [x] Add Integrations link to sidebar

### Weekly Digest Email
- [x] Server: generateWeeklyDigest helper — aggregate 7-day stats per user
- [x] Server: tRPC sendDigestNow (manual trigger for testing)
- [x] Server: scheduled digest cron (every Monday 9 AM)
- [x] Email content: total requests, errors intercepted, top 3 failing APIs, credits used/remaining
- [x] Frontend: digest opt-in toggle in Settings/Account page

### Public API Leaderboard
- [x] Server: tRPC getApiLeaderboard — top 10 most-failed destination domains (anonymized)
- [x] Status page: add leaderboard section below metrics
- [x] Show: domain, failure count (24h), most common error category
