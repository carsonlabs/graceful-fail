# plan-pivot.md

## Product pivot

Treat SelfHeal / Graceful Fail less like a generic proxy dashboard and more like an **agent reliability console**.

The current API Proxy Tester is still useful, but it should be positioned as a sandbox or demo tool, not the main dashboard experience.

## Core insight

Users do not primarily need a place to manually send requests.

They need a place to understand:

- what is breaking
- why it is breaking
- what is recoverable
- what the agent should do next
- whether SelfHeal is reducing wasted retries and debugging time

## New dashboard mental model

The dashboard should act like an **inbox for agent API failures**.

Primary jobs:

1. Show intercepted failures clearly
2. Explain failures in plain language
3. Show structured fix guidance
4. Help users identify recurring reliability issues by workflow or integration
5. Prove product value over time

## Recommended information architecture

### 1. Overview

Purpose:

- answer "is this helping?"

Show:

- total proxied requests
- total intercepted failures
- recoverable vs non-recoverable failures
- top failing APIs
- top error categories
- recent critical failures
- estimated debugging or retry savings

### 2. Failures

Purpose:

- answer "what exactly broke?"

Show a list/table of intercepted events with:

- timestamp
- workflow or app
- destination API
- method
- status code
- error category
- retriable or not
- severity

This should be the core product screen.

### 3. Failure Detail

Purpose:

- answer "what should happen next?"

For each failure, show:

- request summary
- destination URL and method
- sanitized headers/body summary
- raw destination response
- SelfHeal explanation
- actionable fix for agent
- suggested payload/header diff
- retriable recommendation

This is likely the highest-value screen in the product.

### 4. Workflows

Purpose:

- answer "where is reliability pain concentrated?"

Group failures by:

- workflow
- app
- integration
- customer environment

Show:

- request volume
- failure rate
- top recurring error types
- most affected APIs

### 5. Alerts

Purpose:

- answer "when should I know about this?"

Allow:

- Slack/webhook alerts
- threshold-based rules
- alerting only on high-severity or non-retriable issues
- per-workflow notification routing

### 6. API Keys / Settings

Purpose:

- basic account administration

Include:

- create/revoke API keys
- environment labels
- webhook configuration
- allowed destination controls if needed
- retention settings

### 7. Tester

Purpose:

- sandbox, docs aid, and sales/demo utility

Rename current "API Proxy Tester" concept to:

- Tester
- Sandbox
- Try SelfHeal

Do not treat this as the primary dashboard landing page.

## MVP recommendation

Build only this first:

1. Overview
2. Failures list
3. Failure detail
4. API keys/settings
5. Tester

This is enough to make the product understandable.

## Messaging shift

Current framing risks sounding like:

- generic proxy
- low-level infra utility
- request playground

Preferred framing:

- agent reliability layer
- failure recovery console
- inbox for API failures
- structured recovery for broken agent calls

## UX principle

Optimize the dashboard for **triage and learning**, not for manual request entry.

Users should leave the product understanding:

- what failed
- what to fix
- whether retrying makes sense
- which failures happen repeatedly

## Product rule for next iteration

When deciding what to build, ask:

"Does this help users understand and act on agent API failures faster?"

If not, deprioritize it.
