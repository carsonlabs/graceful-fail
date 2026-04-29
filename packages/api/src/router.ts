import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { SelfhealClient } from "../../sdk/src/compliance.js";
import type { CascadeResult } from "../../core/src/types.js";

export interface ComplianceRouterOptions {
  client: SelfhealClient;
  /**
   * API keys accepted via `Authorization: Bearer <key>`. v1 is single-tenant —
   * any key in this set is allowed. Multi-tenant key-to-tenant lookup comes later.
   */
  apiKeys: string[] | (() => string[]);
  /**
   * Base path is decided by the caller via app.use(). The router itself is
   * mount-point agnostic.
   */
}

const eraseSchema = z.object({
  user_id: z.string().min(1),
  reason: z
    .enum(["gdpr_article_17", "ccpa_delete", "ca_delete_act", "user_request", "internal"])
    .optional(),
  requested_by: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["all", "success", "partial", "failed"]).optional(),
});

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authMiddleware(getKeys: () => string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }
    const presented = m[1].trim();
    const allowed = getKeys();
    const ok = allowed.some((k) => timingSafeEq(presented, k));
    if (!ok) {
      res.status(401).json({ error: "invalid_api_key" });
      return;
    }
    next();
  };
}

function summariseCascade(c: CascadeResult) {
  return {
    userId: c.userId,
    status: c.status,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    rootHash: c.auditRootHash,
    adapterCount: c.adapterResults.length,
    adapters: c.adapterResults.map((r) => ({
      name: r.adapter,
      status: r.status,
      recordsAffected: r.recordsAffected,
    })),
  };
}

export function createComplianceRouter(opts: ComplianceRouterOptions): Router {
  const router = Router();
  const getKeys = typeof opts.apiKeys === "function" ? opts.apiKeys : () => opts.apiKeys as string[];
  router.use(authMiddleware(getKeys));

  router.post("/erase", async (req, res) => {
    const parsed = eraseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      return;
    }
    try {
      const result = await opts.client.compliance.eraseUser({
        userId: parsed.data.user_id,
        reason: parsed.data.reason,
        requestedBy: parsed.data.requested_by,
        metadata: parsed.data.metadata,
      });
      res.status(result.status === "failed" ? 207 : 200).json(result);
    } catch (err) {
      res.status(500).json({ error: "erase_failed", message: messageOf(err) });
    }
  });

  router.get("/proof/:userId", async (req, res) => {
    try {
      const proof = await opts.client.compliance.getDeletionProof({ userId: req.params.userId });
      res.json(proof);
    } catch (err) {
      res.status(404).json({ error: "not_found", message: messageOf(err) });
    }
  });

  router.get("/requests", async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", issues: parsed.error.issues });
      return;
    }
    const filter = parsed.data.status && parsed.data.status !== "all" ? { status: parsed.data.status } : undefined;
    const list = await opts.client.compliance.listDeletionHistory(filter);
    res.json({ count: list.length, requests: list.map(summariseCascade) });
  });

  router.get("/status/:userId", async (req, res) => {
    const record = await opts.client.compliance.getDeletionRecord(req.params.userId);
    if (!record) {
      res.json({
        user_id: req.params.userId,
        erased: false,
        compliant: false,
        status: "unknown",
      });
      return;
    }
    res.json({
      user_id: req.params.userId,
      erased: true,
      compliant: record.status === "success",
      status: record.status,
      completedAt: record.completedAt,
      rootHash: record.auditRootHash,
      failedAdapters: record.adapterResults.filter((r) => r.status === "failed").map((r) => r.adapter),
    });
  });

  return router;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
