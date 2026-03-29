#!/bin/bash
# SelfHeal Demo Seeder — fires 18 requests through the proxy
# Mix: ~9 pass-throughs, ~9 intercepted errors
# Usage: bash scripts/seed-demo.sh gf_your_full_api_key_here

API_KEY="${1:?Usage: bash seed-demo.sh <your_gf_api_key>}"
PROXY="https://graceful-fail-production.up.railway.app/api/proxy"

echo "=== PASS-THROUGHS (8) ==="

echo "[1] httpbin GET..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/get" \
  -H "X-Destination-Method: GET"

echo "[2] httpbin POST..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/post" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-47","task":"summarize","input":"Hello world"}'

echo "[3] httpbin anything..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/anything" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"workflow":"data-extraction","step":3}'

echo "[4] httpbin headers..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/headers" \
  -H "X-Destination-Method: GET"

echo "[5] httpbin POST (user create)..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/post" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","role":"admin"}'

echo "[6] httpbin PUT..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/put" \
  -H "X-Destination-Method: PUT" \
  -H "Content-Type: application/json" \
  -d '{"id":42,"status":"completed"}'

echo "[7] httpbin ip..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/ip" \
  -H "X-Destination-Method: GET"

echo "[8] httpbin PATCH..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/patch" \
  -H "X-Destination-Method: PATCH" \
  -H "Content-Type: application/json" \
  -d '{"field":"status","value":"active"}'

sleep 2

echo ""
echo "=== INTERCEPTED ERRORS (10) ==="

echo "[9] OpenAI bad auth (chat)..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.openai.com/v1/chat/completions" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'

echo "[10] Anthropic bad auth..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.anthropic.com/v1/messages" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-ant-invalid-key-demo" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'

echo "[11] OpenAI bad auth (embeddings)..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.openai.com/v1/embeddings" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","input":"demo text"}'

echo "[12] Anthropic wrong version..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.anthropic.com/v1/messages" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-ant-bad-auth-demo" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":50,"messages":[{"role":"user","content":"Test"}]}'

echo "[13] OpenAI missing messages..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.openai.com/v1/chat/completions" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o"}'

echo "[14] Anthropic empty messages..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.anthropic.com/v1/messages" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-ant-bad-validation-demo" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","messages":[]}'

echo "[15] OpenAI wrong model + bad payload..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://api.openai.com/v1/chat/completions" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-turbo-max","prompt":"This is wrong field name"}'

echo "[16] httpbin 404..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/status/404" \
  -H "X-Destination-Method: GET"

echo "[17] httpbin 500..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/status/500" \
  -H "X-Destination-Method: GET"

echo "[18] httpbin 422..."
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PROXY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Destination-URL: https://httpbin.org/status/422" \
  -H "X-Destination-Method: POST" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"payload"}'

echo ""
echo "=== DONE! 18 requests fired ==="
echo "Expected: ~8 pass-throughs, ~10 intercepted errors"
echo "Refresh your dashboard to see updated analytics"
