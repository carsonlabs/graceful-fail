# graceful-fail

[![PyPI](https://img.shields.io/pypi/v/graceful-fail)](https://pypi.org/project/graceful-fail/)
[![npm](https://img.shields.io/npm/v/graceful-fail)](https://www.npmjs.com/package/graceful-fail)

> Part of [SelfHeal](https://selfheal.dev) — autonomous error recovery for AI agents.

**Self-healing API proxy for AI agents.** Route your HTTP calls through Graceful Fail and get structured, LLM-powered fix instructions when APIs return errors.

Instead of your agent crashing on a `422` or retrying a `503` blindly, it gets back:

```json
{
  "is_retriable": false,
  "actionable_fix_for_agent": "Remove 'name' field. Add 'first_name' and 'last_name' as separate string fields.",
  "suggested_payload_diff": {
    "remove": ["name"],
    "add": {"first_name": "string", "last_name": "string"}
  },
  "error_category": "validation_error"
}
```

Successful requests (2xx/3xx) pass through with zero overhead. You only pay when the LLM is invoked on a failed request.

## Install

```bash
pip install graceful-fail
```

With LangChain support:

```bash
pip install 'graceful-fail[langchain]'
```

## Quick Start

```python
from graceful_fail import GracefulFail

gf = GracefulFail(api_key="gf_your_key")

response = gf.post("https://api.example.com/users", json={"name": "Alice"})

if response.intercepted:
    # The API returned an error — here's exactly how to fix it
    print(response.error_analysis.actionable_fix_for_agent)
    print(response.error_analysis.suggested_payload_diff)
else:
    # Success — here's the data
    print(response.data)
```

## Async Support

```python
from graceful_fail import GracefulFailAsync

async with GracefulFailAsync(api_key="gf_your_key") as gf:
    response = await gf.post("https://api.example.com/users", json={"name": "Alice"})
```

## LangChain Integration

### As a Tool (recommended for agents)

```python
from graceful_fail.langchain import GracefulFailTool
from langchain.agents import create_react_agent

tool = GracefulFailTool(api_key="gf_your_key")
agent = create_react_agent(llm, [tool])

# Your agent now gets structured fix instructions instead of raw HTTP errors
```

### As a Requests Wrapper

Drop-in replacement for LangChain's `TextRequestsWrapper`:

```python
from graceful_fail.langchain import GracefulFailRequests

requests = GracefulFailRequests(api_key="gf_your_key")
result = requests.get("https://api.example.com/users")
```

## requests-Compatible Session

For codebases already using `requests`:

```python
from graceful_fail.patch import GracefulFailSession

session = GracefulFailSession(api_key="gf_your_key")
resp = session.post("https://api.example.com/users", json={"name": "Alice"})

print(resp.status_code)
print(resp.json())

if resp.graceful_fail_intercepted:
    print(resp.error_analysis)
```

## Response Object

Every call returns a `GracefulFailResponse`:

| Field | Type | Description |
|---|---|---|
| `status_code` | `int` | HTTP status from the destination API |
| `intercepted` | `bool` | `True` if the error was analyzed by the LLM |
| `data` | `Any` | Response body (success) or full error envelope (intercepted) |
| `error_analysis` | `ErrorAnalysis` | LLM analysis (only when `intercepted=True`) |
| `raw_response` | `Any` | Original destination API response body |
| `credits_used` | `int` | 0 for pass-through, 1 for intercepted |

### ErrorAnalysis Fields

| Field | Type | Description |
|---|---|---|
| `is_retriable` | `bool` | Whether retrying the same request may succeed |
| `human_readable_explanation` | `str` | What went wrong, in plain English |
| `actionable_fix_for_agent` | `str` | Exact instruction for the agent |
| `suggested_payload_diff` | `PayloadDiff` | What to change (remove/add/modify) |
| `error_category` | `str` | `validation_error`, `auth_error`, `rate_limit`, etc. |

### Auto-Apply Fix

```python
if response.intercepted:
    fixed_payload = response.error_analysis.suggested_payload_diff.apply(original_payload)
    retry_response = gf.post(url, json=fixed_payload)
```

## Get Your API Key

1. Sign up at [selfheal.dev](https://selfheal.dev)
2. Create an API key in the dashboard
3. Free tier: 500 requests/month

## Links

- [Documentation](https://selfheal.dev/docs)
- [Dashboard](https://selfheal.dev/dashboard)
- [Status](https://selfheal.dev/status)
- [Changelog](https://selfheal.dev/changelog)
