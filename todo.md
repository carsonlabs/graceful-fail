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
