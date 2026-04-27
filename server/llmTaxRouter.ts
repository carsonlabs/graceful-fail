/**
 * llm-tax campaign API — receives anonymized scan submissions from
 * `npx llm-tax --share` and lets users claim them with email.
 *
 * Storage: in-memory Map for v1. Swap for Postgres / db.ts when usage warrants.
 * Scans expire 30 days after submission. Claims persist alongside the scan.
 */

import { Router, type Request, type Response } from "express";

interface AnonScan {
  scanId: string;
  apiCount: number;
  avgWastePercent: number;
  monthlyWasteUsd: number;
  platform?: string;
  nodeVersion?: string;
  timestamp: string;
  expiresAt: number;
  claimedEmail?: string;
  claimedAt?: string;
}

const SCAN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCAN_ID_REGEX = /^[a-z2-9]{6,16}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SCANS = 50_000;

const scans = new Map<string, AnonScan>();

// Periodic cleanup of expired scans
setInterval(() => {
  const now = Date.now();
  for (const [id, scan] of scans) {
    if (scan.expiresAt < now) scans.delete(id);
  }
}, 60 * 60 * 1000); // hourly

// Per-IP rate limit (in-memory token bucket)
const rateBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_SHARE_MAX = 100; // 100 anon submissions per hour per IP
const RATE_CLAIM_MAX = 10; // 10 claims per hour per IP

function checkRate(ip: string, max: number): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= max;
}

function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.ip
    ?? "unknown";
}

export const llmTaxRouter = Router();

/** POST /api/llm-tax/anon-share — receive anonymized scan summary */
llmTaxRouter.post("/api/llm-tax/anon-share", (req: Request, res: Response) => {
  if (!checkRate(getIp(req), RATE_SHARE_MAX)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }
  if (scans.size >= MAX_SCANS) {
    // Defensive cap to prevent memory blowup before periodic cleanup runs
    return res.status(503).json({ error: "Temporarily unavailable" });
  }

  const body = req.body ?? {};
  const scanId = String(body.scanId ?? "");
  const apiCount = Number(body.apiCount);
  const avgWastePercent = Number(body.avgWastePercent);
  const monthlyWasteUsd = Number(body.monthlyWasteUsd);

  if (!SCAN_ID_REGEX.test(scanId)) {
    return res.status(400).json({ error: "Invalid scanId format" });
  }
  if (!Number.isFinite(apiCount) || apiCount < 0 || apiCount > 10_000) {
    return res.status(400).json({ error: "Invalid apiCount" });
  }
  if (!Number.isFinite(avgWastePercent) || avgWastePercent < 0 || avgWastePercent > 100) {
    return res.status(400).json({ error: "Invalid avgWastePercent" });
  }
  if (!Number.isFinite(monthlyWasteUsd) || monthlyWasteUsd < 0 || monthlyWasteUsd > 1_000_000) {
    return res.status(400).json({ error: "Invalid monthlyWasteUsd" });
  }

  const platform = typeof body.platform === "string" ? body.platform.slice(0, 32) : undefined;
  const nodeVersion = typeof body.nodeVersion === "string" ? body.nodeVersion.slice(0, 32) : undefined;
  const now = Date.now();

  scans.set(scanId, {
    scanId,
    apiCount: Math.round(apiCount),
    avgWastePercent: Math.round(avgWastePercent),
    monthlyWasteUsd,
    platform,
    nodeVersion,
    timestamp: new Date(now).toISOString(),
    expiresAt: now + SCAN_TTL_MS,
  });

  return res.json({ ok: true, scanId });
});

/** GET /api/llm-tax/scan/:scanId — fetch scan summary for the claim page */
llmTaxRouter.get("/api/llm-tax/scan/:scanId", (req: Request, res: Response) => {
  const scanId = req.params.scanId ?? "";
  if (!SCAN_ID_REGEX.test(scanId)) {
    return res.status(400).json({ error: "Invalid scanId format" });
  }
  const scan = scans.get(scanId);
  if (!scan || scan.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Scan not found" });
  }
  // Don't leak the claimed email back to the client
  const { claimedEmail: _omit, ...publicScan } = scan;
  return res.json(publicScan);
});

/** POST /api/llm-tax/scan/:scanId/claim — capture email for a scan */
llmTaxRouter.post("/api/llm-tax/scan/:scanId/claim", (req: Request, res: Response) => {
  if (!checkRate(getIp(req), RATE_CLAIM_MAX)) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in an hour." });
  }

  const scanId = req.params.scanId ?? "";
  const email = String(req.body?.email ?? "").trim().toLowerCase();

  if (!SCAN_ID_REGEX.test(scanId)) {
    return res.status(400).json({ error: "Invalid scanId format" });
  }
  if (!EMAIL_REGEX.test(email) || email.length > 256) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const scan = scans.get(scanId);
  if (!scan || scan.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Scan not found or expired" });
  }

  scan.claimedEmail = email;
  scan.claimedAt = new Date().toISOString();
  // Extend expiry to 1 year on claim
  scan.expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

  return res.json({ ok: true });
});
