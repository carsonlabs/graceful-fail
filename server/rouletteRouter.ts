import { Router, Request, Response } from "express";

// ─── API Roulette ────────────────────────────────────────────────────
// A chaos testing endpoint that randomly fails with realistic API errors.
// Use it as a destination URL when testing SelfHeal proxy resilience.
//
// GET/POST /api/roulette         → random failure (or success if you're lucky)
// GET/POST /api/roulette?bias=errors  → only errors, never 200
// GET/POST /api/roulette?bias=success → mostly success, rare errors
// GET/POST /api/roulette/:scenario    → specific failure scenario

interface Scenario {
  name: string;
  status: number;
  delay: number; // ms
  headers: Record<string, string>;
  body: unknown;
  description: string;
}

const SCENARIOS: Scenario[] = [
  // ── Success (boring but necessary) ──
  {
    name: "success",
    status: 200,
    delay: 50,
    headers: { "Content-Type": "application/json" },
    body: { ok: true, message: "You got lucky. This time.", roulette: true },
    description: "Clean 200. Nothing to see here.",
  },

  // ── Rate Limiting ──
  {
    name: "rate-limit",
    status: 429,
    delay: 10,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "30",
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 30),
    },
    body: {
      error: "rate_limit_exceeded",
      message: "You have exceeded the rate limit of 100 requests per minute.",
      retry_after: 30,
    },
    description: "Classic 429 with Retry-After header.",
  },

  // ── Timeout ──
  {
    name: "timeout",
    status: 504,
    delay: 12000, // 12 seconds — will likely trigger client timeout
    headers: { "Content-Type": "application/json" },
    body: {
      error: "gateway_timeout",
      message: "The upstream server did not respond in time.",
    },
    description: "Hangs for 12s, then returns 504.",
  },

  // ── Slow Response ──
  {
    name: "slow",
    status: 200,
    delay: 5000,
    headers: { "Content-Type": "application/json" },
    body: {
      ok: true,
      message: "I got here eventually...",
      latency_ms: 5000,
    },
    description: "Responds after 5s — tests timeout handling.",
  },

  // ── Internal Server Error ──
  {
    name: "server-error",
    status: 500,
    delay: 100,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "internal_server_error",
      message: "Something went catastrophically wrong.",
      request_id: "req_" + Math.random().toString(36).slice(2, 10),
      trace: "NullPointerException at com.example.api.Handler.process(Handler.java:42)",
    },
    description: "Generic 500 with a fake stack trace.",
  },

  // ── Bad Gateway ──
  {
    name: "bad-gateway",
    status: 502,
    delay: 200,
    headers: { "Content-Type": "text/html" },
    body: "<html><body><h1>502 Bad Gateway</h1><p>nginx/1.24.0</p></body></html>",
    description: "HTML 502 error — the kind that breaks JSON parsers.",
  },

  // ── Malformed JSON ──
  {
    name: "malformed-json",
    status: 200,
    delay: 50,
    headers: { "Content-Type": "application/json" },
    body: '{"data": [{"id": 1, "name": "test"',  // intentionally truncated
    description: "200 OK but the JSON is truncated. Good luck parsing that.",
  },

  // ── Empty Body ──
  {
    name: "empty-body",
    status: 200,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: "",
    description: "200 OK with an empty body. Technically not wrong...",
  },

  // ── 418 I'm a Teapot ──
  {
    name: "teapot",
    status: 418,
    delay: 50,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "im_a_teapot",
      message: "The server refuses to brew coffee because it is, permanently, a teapot.",
      see: "RFC 2324",
    },
    description: "The classic 418. Because why not.",
  },

  // ── Authentication Error ──
  {
    name: "auth-error",
    status: 401,
    delay: 30,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="api", error="invalid_token"',
    },
    body: {
      error: "unauthorized",
      message: "The access token is expired or invalid.",
      code: "TOKEN_EXPIRED",
    },
    description: "401 with WWW-Authenticate header.",
  },

  // ── Forbidden ──
  {
    name: "forbidden",
    status: 403,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "forbidden",
      message: "You don't have permission to access this resource.",
      required_scope: "admin:write",
    },
    description: "403 with a scope hint.",
  },

  // ── Not Found ──
  {
    name: "not-found",
    status: 404,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "not_found",
      message: "The resource you requested does not exist.",
      suggestion: "Did you mean /api/v2/users?",
    },
    description: "404 with a helpful suggestion.",
  },

  // ── Validation Error ──
  {
    name: "validation-error",
    status: 422,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "validation_error",
      message: "Request body failed validation.",
      details: [
        { field: "email", message: "must be a valid email address" },
        { field: "age", message: "must be a positive integer" },
        { field: "name", message: "is required" },
      ],
    },
    description: "422 with structured field-level validation errors.",
  },

  // ── Service Unavailable ──
  {
    name: "maintenance",
    status: 503,
    delay: 50,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "300",
    },
    body: {
      error: "service_unavailable",
      message: "API is undergoing scheduled maintenance. Please try again in 5 minutes.",
      maintenance_window: {
        start: new Date().toISOString(),
        estimated_end: new Date(Date.now() + 300000).toISOString(),
      },
    },
    description: "503 maintenance window with Retry-After.",
  },

  // ── Conflict ──
  {
    name: "conflict",
    status: 409,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "conflict",
      message: "A resource with that identifier already exists.",
      existing_id: "usr_" + Math.random().toString(36).slice(2, 10),
    },
    description: "409 Conflict — duplicate resource.",
  },

  // ── Too Large ──
  {
    name: "too-large",
    status: 413,
    delay: 30,
    headers: { "Content-Type": "application/json" },
    body: {
      error: "payload_too_large",
      message: "Request body exceeds the 10MB limit.",
      max_bytes: 10485760,
    },
    description: "413 Payload Too Large.",
  },

  // ── Connection Reset (abrupt close) ──
  {
    name: "connection-reset",
    status: 0, // special: we destroy the socket
    delay: 100,
    headers: {},
    body: null,
    description: "Abruptly closes the TCP connection. No response at all.",
  },

  // ── Partial Response ──
  {
    name: "partial-response",
    status: 200,
    delay: 50,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "500", // lies about content length
    },
    body: '{"data": [1, 2, 3',
    description: "200 OK but Content-Length lies. Connection closes mid-stream.",
  },

  // ── Wrong Content-Type ──
  {
    name: "wrong-content-type",
    status: 200,
    delay: 30,
    headers: { "Content-Type": "text/html" }, // says HTML, sends JSON
    body: { ok: true, message: "I said I was HTML but I lied." },
    description: "Content-Type says text/html but body is JSON.",
  },
];

const ERROR_SCENARIOS = SCENARIOS.filter((s) => s.name !== "success");

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sendScenario(res: Response, scenario: Scenario, req: Request) {
  setTimeout(() => {
    // Connection reset — destroy the socket
    if (scenario.name === "connection-reset") {
      req.socket.destroy();
      return;
    }

    // Set headers
    for (const [key, value] of Object.entries(scenario.headers)) {
      res.setHeader(key, value);
    }

    // Add roulette metadata headers
    res.setHeader("X-Roulette-Scenario", scenario.name);
    res.setHeader("X-Roulette-Description", scenario.description);

    res.status(scenario.status);

    // Send body
    if (typeof scenario.body === "string") {
      res.send(scenario.body);
    } else if (scenario.body === null || scenario.body === "") {
      res.end();
    } else {
      res.json(scenario.body);
    }
  }, scenario.delay);
}

export const rouletteRouter = Router();

// List all scenarios
rouletteRouter.get("/api/roulette/scenarios", (_req: Request, res: Response) => {
  res.json({
    title: "API Roulette - Chaos Testing Endpoint",
    description:
      "Point your SelfHeal proxy at this endpoint to test how it handles real-world API failures.",
    usage: {
      random: "GET/POST /api/roulette",
      biased: "GET/POST /api/roulette?bias=errors|success",
      specific: "GET/POST /api/roulette/:scenario",
      list: "GET /api/roulette/scenarios",
    },
    scenarios: SCENARIOS.map((s) => ({
      name: s.name,
      status: s.status || "CONNECTION_RESET",
      delay_ms: s.delay,
      description: s.description,
    })),
    total: SCENARIOS.length,
  });
});

// Specific scenario
rouletteRouter.all("/api/roulette/:scenario", (req: Request, res: Response) => {
  const scenario = SCENARIOS.find((s) => s.name === req.params.scenario);
  if (!scenario) {
    res.status(404).json({
      error: "unknown_scenario",
      message: `Scenario "${req.params.scenario}" not found.`,
      available: SCENARIOS.map((s) => s.name),
    });
    return;
  }
  sendScenario(res, scenario, req);
});

// Random scenario (the main event)
rouletteRouter.all("/api/roulette", (req: Request, res: Response) => {
  const bias = (req.query.bias as string)?.toLowerCase();

  let pool: Scenario[];
  if (bias === "errors") {
    pool = ERROR_SCENARIOS;
  } else if (bias === "success") {
    // 80% success, 20% error
    pool = Math.random() < 0.8
      ? SCENARIOS.filter((s) => s.name === "success")
      : ERROR_SCENARIOS;
  } else {
    // Default: ~30% success, 70% chaos
    pool = Math.random() < 0.3
      ? SCENARIOS.filter((s) => s.name === "success")
      : ERROR_SCENARIOS;
  }

  const scenario = pickRandom(pool);
  sendScenario(res, scenario, req);
});
