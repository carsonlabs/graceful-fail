import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { proxyHandler } from "../proxyEngine";
import { sentryWebhookHandler } from "../sentryWebhook";
import { registerStripeWebhook } from "../stripeRouter";
import { buildOpenApiSpec } from "../openApiSpec";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { runScan } from "../scanEngine";
import { rouletteRouter } from "../rouletteRouter";
import { createX402Router } from "../x402Proxy";
import { llmTaxRouter } from "../llmTaxRouter";
import { MonitoringRegistry } from "../monitoring";
import { ResponseCache } from "../responseCache";
import { mountComplianceFromEnv } from "@selfheal/api";

// Resolve project root — works from both server/_core/ (dev) and dist/ (prod)
const PROJECT_ROOT = process.env.NODE_ENV === "production"
  ? path.resolve(import.meta.dirname, "..")
  : path.resolve(import.meta.dirname, "..", "..");

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the single reverse proxy in front of us (Railway/Vercel put one hop
  // before our app). Without this, `req.ip` returns the proxy's IP and
  // `X-Forwarded-For` is unsanitized — any client could spoof source IP and
  // bypass per-IP rate limits by setting `X-Forwarded-For: 1.2.3.4`.
  app.set("trust proxy", 1);

  // Stripe webhook — MUST be registered BEFORE express.json() so it receives the raw body
  // for signature verification. express.json() consumes the body stream irreversibly.
  registerStripeWebhook(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // SelfHeal proxy endpoint — raw Express route (needs raw body access)
  app.post("/api/proxy", proxyHandler);

  // Sentry inbound webhook — receives events from Sentry
  app.post("/api/webhooks/sentry", sentryWebhookHandler);

  // API Roulette — chaos testing endpoint
  app.use(rouletteRouter);

  // llm-tax campaign — anonymized scan submissions + email claim
  app.use(llmTaxRouter);

  // selfheal v2 compliance module — right-to-erasure cascade + signed audit log.
  // No-ops silently when SELFHEAL_API_KEY is unset; throws on partial config.
  const compliance = await mountComplianceFromEnv(app, "/api/compliance");
  if (compliance.enabled) {
    console.log("[compliance] mounted at /api/compliance");
  } else {
    console.log(`[compliance] disabled (${compliance.reason})`);
  }

  // x402 outcome-based pricing — agent-native proxy + heal endpoints
  const monitor = new MonitoringRegistry();
  const responseCache = new ResponseCache(1000, 30_000);
  const { router: x402Router, shutdown: x402Shutdown } = createX402Router({
    monitor,
    cache: responseCache,
  });
  app.use(x402Router);
  monitor.startAlertLoop();

  // Badge — public, cacheable
  app.get("/badge.svg", (_req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="162" height="20" role="img" aria-label="built with: SelfHeal"><title>built with: SelfHeal</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="162" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="72" height="20" fill="#1f2937"/><rect x="72" width="90" height="20" fill="#10b981"/><rect width="162" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text aria-hidden="true" x="370" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="620">built with</text><text x="370" y="140" transform="scale(.1)" fill="#fff" textLength="620">built with</text><text aria-hidden="true" x="1170" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="800">SelfHeal</text><text x="1170" y="140" transform="scale(.1)" fill="#fff" textLength="800">SelfHeal</text></g></svg>`);
  });

  // robots.txt — allow all crawlers, point to sitemap
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "# Dashboard routes — no indexing (auth-gated SPA)",
        "Disallow: /dashboard",
        "Disallow: /api/",
        "",
        "Sitemap: https://selfheal.dev/sitemap.xml",
      ].join("\n")
    );
  });

  // sitemap.xml — public pages only
  app.get("/sitemap.xml", (_req, res) => {
    const pages = [
      { loc: "/", priority: "1.0", changefreq: "weekly" },
      { loc: "/llm-tax", priority: "0.9", changefreq: "weekly" },
      { loc: "/docs", priority: "0.9", changefreq: "weekly" },
      { loc: "/status", priority: "0.7", changefreq: "daily" },
      { loc: "/changelog", priority: "0.6", changefreq: "weekly" },
      { loc: "/terms", priority: "0.3", changefreq: "yearly" },
      { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
    ];
    const today = new Date().toISOString().split("T")[0];
    const urls = pages
      .map(
        (p) =>
          `  <url>\n    <loc>https://selfheal.dev${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
      )
      .join("\n");
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
  });

  // OpenAPI spec — public, no auth required
  app.get("/api/openapi.json", (req, res) => {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;
    res.json(buildOpenApiSpec(baseUrl));
  });

  // Public audit reports — serves JSON from data/audits/<slug>.json
  app.get("/api/audits/:slug", (req, res) => {
    const slug = req.params.slug.replace(/[^a-zA-Z0-9._-]/g, "");
    const auditPath = path.resolve(PROJECT_ROOT, "data", "audits", `${slug}.json`);
    if (!existsSync(auditPath)) {
      res.status(404).json({ error: "Audit not found" });
      return;
    }
    const data = JSON.parse(readFileSync(auditPath, "utf-8"));
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json(data);
  });

  // Public scan endpoint — scans a GitHub repo for AI resilience issues
  // Rate limit: 1 scan per IP per 5 minutes, cached results served instantly
  const scanRateLimit = new Map<string, number>();
  const SCAN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  app.post("/api/scan", async (req, res) => {
    const { repo } = req.body as { repo?: string };
    if (!repo || !repo.includes("/")) {
      res.status(400).json({ error: "Provide a repo in owner/repo format" });
      return;
    }

    // Sanitize
    const clean = repo.replace(/[^a-zA-Z0-9/_.-]/g, "").slice(0, 100);
    const slug = clean.replace(/\//g, "-").replace(/[^a-zA-Z0-9.-]/g, "_");
    const auditDir = path.resolve(PROJECT_ROOT, "data", "audits");
    const cachedPath = path.resolve(auditDir, `${slug}.json`);

    // Check cache first — return existing scan if less than 24h old
    if (existsSync(cachedPath)) {
      try {
        const cached = JSON.parse(readFileSync(cachedPath, "utf-8"));
        const scannedAt = cached.scannedAt ? new Date(cached.scannedAt).getTime() : 0;
        const ageMs = Date.now() - scannedAt;
        if (ageMs < 24 * 60 * 60 * 1000) {
          res.setHeader("X-Cache", "HIT");
          res.json(cached);
          return;
        }
      } catch { /* stale or invalid cache, re-scan */ }
    }

    // Rate limit per IP
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const lastScan = scanRateLimit.get(ip) ?? 0;
    if (Date.now() - lastScan < SCAN_COOLDOWN_MS) {
      const waitSec = Math.ceil((SCAN_COOLDOWN_MS - (Date.now() - lastScan)) / 1000);
      res.status(429).json({ error: `Rate limited. Try again in ${waitSec} seconds.` });
      return;
    }

    scanRateLimit.set(ip, Date.now());

    // Clean up old rate limit entries every 100 requests
    if (scanRateLimit.size > 1000) {
      const cutoff = Date.now() - SCAN_COOLDOWN_MS;
      for (const [k, v] of scanRateLimit) { if (v < cutoff) scanRateLimit.delete(k); }
    }

    try {
      const result = await runScan(clean);
      // Cache the result
      mkdirSync(auditDir, { recursive: true });
      writeFileSync(cachedPath, JSON.stringify(result, null, 2), "utf-8");
      res.setHeader("X-Cache", "MISS");
      res.json(result);
    } catch (err: any) {
      const msg = err.message ?? "Scan failed";
      const status = msg.includes("Not Found") ? 404 : msg.includes("No AI") ? 422 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");
    x402Shutdown();
    monitor.stopAlertLoop();
    server.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch(console.error);
