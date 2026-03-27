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
import { registerStripeWebhook } from "../stripeRouter";
import { buildOpenApiSpec } from "../openApiSpec";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Stripe webhook — must be registered BEFORE express.json() with raw body
  registerStripeWebhook(app);

  // SelfHeal proxy endpoint — raw Express route (needs raw body access)
  app.post("/api/proxy", proxyHandler);

  // Badge — public, cacheable
  app.get("/badge.svg", (_req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="162" height="20" role="img" aria-label="built with: SelfHeal"><title>built with: SelfHeal</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="162" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="72" height="20" fill="#1f2937"/><rect x="72" width="90" height="20" fill="#10b981"/><rect width="162" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text aria-hidden="true" x="370" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="620">built with</text><text x="370" y="140" transform="scale(.1)" fill="#fff" textLength="620">built with</text><text aria-hidden="true" x="1170" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="800">SelfHeal</text><text x="1170" y="140" transform="scale(.1)" fill="#fff" textLength="800">SelfHeal</text></g></svg>`);
  });

  // OpenAPI spec — public, no auth required
  app.get("/api/openapi.json", (req, res) => {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;
    res.json(buildOpenApiSpec(baseUrl));
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
}

startServer().catch(console.error);
