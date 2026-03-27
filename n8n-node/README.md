# n8n-nodes-graceful-fail

[n8n](https://n8n.io/) community node for [Graceful Fail](https://selfheal.dev) — the AI-powered API error recovery proxy.

Graceful Fail sits between your workflow and any API. Successful requests pass through unchanged. Failed requests (4xx/5xx) are analyzed by an LLM and return structured fix instructions so your workflow can self-heal.

## Installation

### Community Node (recommended)

1. Open your n8n instance
2. Go to **Settings > Community Nodes**
3. Click **Install a community node**
4. Enter `n8n-nodes-graceful-fail`
5. Click **Install**

### Manual Installation

```bash
cd ~/.n8n
npm install n8n-nodes-graceful-fail
```

Restart n8n after installing.

## Setup

1. Get an API key from [selfheal.dev](https://selfheal.dev) (keys start with `gf_`)
2. In n8n, create a new **Graceful Fail API** credential and paste your key

## Node Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| **Destination URL** | Yes | The target API endpoint to proxy the request to |
| **HTTP Method** | Yes | GET, POST, PUT, PATCH, or DELETE (default: POST) |
| **Request Body** | No | JSON payload to forward (hidden for GET/DELETE) |
| **Extra Headers** | No | Additional headers to include in the proxied request |
| **Auto-Retry with Fix** | No | When enabled, automatically applies Graceful Fail's suggested payload diff and retries once |

## Output

### On Success (2xx/3xx from destination)

```json
{
  "success": true,
  "retried": false,
  "data": { ... }
}
```

The `data` field contains the verbatim response from the destination API.

### On Intercepted Error (4xx/5xx from destination)

```json
{
  "success": false,
  "retried": false,
  "graceful_fail_intercepted": true,
  "error_analysis": {
    "is_retriable": true,
    "human_readable_explanation": "The API rejected the request because the 'email' field is malformed.",
    "actionable_fix_for_agent": "Change the email field to a valid email format.",
    "suggested_payload_diff": {
      "remove": [],
      "add": {},
      "modify": {
        "email": "user@example.com"
      }
    },
    "error_category": "validation_error"
  }
}
```

### On Auto-Retry Success

```json
{
  "success": true,
  "retried": true,
  "applied_diff": { "modify": { "email": "user@example.com" } },
  "data": { ... }
}
```

### On Auto-Retry Failure

```json
{
  "success": false,
  "retried": true,
  "original_error": { ... },
  "retry_error": { ... },
  "applied_diff": { ... }
}
```

## Usage Examples

### Basic API Call with Error Recovery

1. Add a **Graceful Fail** node
2. Set **Destination URL** to your API endpoint
3. Set **HTTP Method** and **Request Body**
4. Connect an **IF** node to check `{{ $json.success }}`
5. Route success/failure to different branches

### Self-Healing Workflow

1. Add a **Graceful Fail** node with **Auto-Retry with Fix** enabled
2. If the first attempt fails, Graceful Fail will analyze the error, apply the suggested fix, and retry automatically
3. Your workflow only sees the final result — either a successful retry or the error analysis if the retry also failed

### Chaining with AI Agents

Use Graceful Fail as the HTTP layer in AI agent workflows. When an API call fails, the `actionable_fix_for_agent` field gives your agent clear instructions on how to fix the request, enabling truly self-healing agent loops.

## How It Works

```
Your n8n Workflow
       |
       v
  Graceful Fail Proxy (selfheal.dev/api/proxy)
       |
       v
  Destination API
       |
  Success? -----> Pass response through
       |
  Error? -------> LLM analyzes the error
       |           Returns structured fix instructions
       v
  Auto-retry? --> Apply diff, retry once
```

## Links

- [Graceful Fail](https://selfheal.dev) — Product website
- [API Documentation](https://selfheal.dev/docs) — Full API reference
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/) — How community nodes work

## License

MIT
