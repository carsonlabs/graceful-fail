# Graceful Fail — Self-Healing API Proxy Action

Route any API call through [Graceful Fail](https://selfheal.dev) and get LLM-powered fix instructions when things break. One line in your workflow, instant self-healing error handling.

## Quick Start

```yaml
- uses: selfheal/proxy-action@v1
  with:
    api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
    url: https://api.example.com/deploy
    method: POST
    body: '{"version": "1.2.3"}'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | Your Graceful Fail API key |
| `url` | Yes | — | Destination URL to proxy the request to |
| `method` | No | `POST` | HTTP method for the destination request |
| `body` | No | — | Request body (JSON string) |
| `headers` | No | — | Additional headers to forward (JSON object string) |
| `fail-on-error` | No | `false` | Fail the step on non-retriable errors |

## Outputs

| Output | Description |
|--------|-------------|
| `status-code` | HTTP status code from the destination |
| `intercepted` | Whether Graceful Fail intercepted an error (`true`/`false`) |
| `response` | Response body from the destination |
| `error-analysis` | LLM-powered analysis of the error (only on intercepted errors) |
| `is-retriable` | Whether the error is retriable (`true`/`false`) |
| `fix-suggestion` | Suggested fix for the error |

## Usage Examples

### Basic Usage

```yaml
steps:
  - uses: selfheal/proxy-action@v1
    with:
      api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
      url: https://api.example.com/deploy
      method: POST
      body: '{"version": "${{ github.sha }}"}'
```

### With Error Handling

Use outputs in subsequent steps to react to errors:

```yaml
steps:
  - uses: selfheal/proxy-action@v1
    id: deploy
    with:
      api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
      url: https://api.example.com/deploy
      method: POST
      body: '{"version": "${{ github.sha }}"}'

  - if: steps.deploy.outputs.intercepted == 'true'
    run: |
      echo "Error intercepted!"
      echo "Analysis: ${{ steps.deploy.outputs.error-analysis }}"
      echo "Fix: ${{ steps.deploy.outputs.fix-suggestion }}"
      echo "Retriable: ${{ steps.deploy.outputs.is-retriable }}"
```

### With fail-on-error

Automatically fail the workflow step when a non-retriable error is detected:

```yaml
steps:
  - uses: selfheal/proxy-action@v1
    with:
      api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
      url: https://api.example.com/deploy
      method: POST
      body: '{"version": "${{ github.sha }}"}'
      fail-on-error: true
```

### Full Workflow with Retry on Retriable Errors

```yaml
name: Deploy with Self-Healing
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via Graceful Fail
        uses: selfheal/proxy-action@v1
        id: deploy
        with:
          api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
          url: https://api.example.com/deploy
          method: POST
          body: '{"version": "${{ github.sha }}", "env": "production"}'
          headers: '{"X-Deploy-Token": "${{ secrets.DEPLOY_TOKEN }}"}'

      - name: Retry if retriable
        if: steps.deploy.outputs.intercepted == 'true' && steps.deploy.outputs.is-retriable == 'true'
        uses: selfheal/proxy-action@v1
        id: retry
        with:
          api-key: ${{ secrets.GRACEFUL_FAIL_KEY }}
          url: https://api.example.com/deploy
          method: POST
          body: '{"version": "${{ github.sha }}", "env": "production"}'
          headers: '{"X-Deploy-Token": "${{ secrets.DEPLOY_TOKEN }}"}'
          fail-on-error: true

      - name: Post deploy status
        if: always()
        run: |
          if [ "${{ steps.deploy.outputs.intercepted }}" == "true" ]; then
            echo "::warning::Deploy had issues. Analysis: ${{ steps.deploy.outputs.error-analysis }}"
          else
            echo "Deploy succeeded with status ${{ steps.deploy.outputs.status-code }}"
          fi
```

## How It Works

1. Your API call is routed through the Graceful Fail proxy at `selfheal.dev/api/proxy`
2. If the destination returns an error, Graceful Fail intercepts it and runs LLM-powered analysis
3. The action surfaces the error analysis, retriability, and fix suggestions as step outputs
4. You decide what to do: retry, alert, fail, or fix automatically

## Building

```bash
npm install
npm run build
```

The `dist/` directory is committed to the repo so the action can run without a build step.

## License

MIT
