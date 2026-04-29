import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SelfhealClient } from "../../sdk/src/compliance.js";
import type { EraseReason } from "../../core/src/types.js";

export interface BuildMcpServerOptions {
  client: SelfhealClient;
  name?: string;
  version?: string;
}

const reasonValues = [
  "gdpr_article_17",
  "ccpa_delete",
  "ca_delete_act",
  "user_request",
  "internal",
] as const satisfies readonly EraseReason[];

export function buildMcpServer(opts: BuildMcpServerOptions): McpServer {
  const { client } = opts;
  const server = new McpServer({
    name: opts.name ?? "selfheal-compliance",
    version: opts.version ?? "0.1.0",
  });

  server.registerTool(
    "selfheal_erase_user",
    {
      title: "Erase user across all configured data stores",
      description:
        "Cascades a GDPR/CCPA right-to-erasure request across every configured adapter (Postgres, pgvector, Pinecone, etc.). Returns per-adapter results and a tamper-evident audit root hash. Idempotent on already-erased users.",
      inputSchema: {
        user_id: z.string().min(1).describe("Internal user identifier to erase"),
        reason: z.enum(reasonValues).optional().describe("Legal basis for the erasure"),
        requested_by: z
          .string()
          .optional()
          .describe("Who initiated the request (email or operator id) — recorded in the audit log"),
      },
    },
    async ({ user_id, reason, requested_by }) => {
      const result = await client.compliance.eraseUser({
        userId: user_id,
        reason,
        requestedBy: requested_by,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "selfheal_get_deletion_proof",
    {
      title: "Get a signed compliance proof for a prior erasure",
      description:
        "Returns the cryptographically-signed deletion proof for a user whose erasure has already run. Includes the full HMAC-chained audit log, adapter results, root hash, and a base64 signed receipt suitable for compliance auditors. Throws if the user has no recorded erasure.",
      inputSchema: {
        user_id: z.string().min(1).describe("Internal user identifier"),
      },
    },
    async ({ user_id }) => {
      const proof = await client.compliance.getDeletionProof({ userId: user_id });
      return {
        content: [{ type: "text", text: JSON.stringify(proof, null, 2) }],
        structuredContent: proof as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "selfheal_list_pending_requests",
    {
      title: "List deletion requests recorded by this server",
      description:
        "Lists every recorded deletion request with its current status. v1 is synchronous, so completed requests dominate; future versions add an async queue with truly pending entries.",
      inputSchema: {
        status: z
          .enum(["all", "success", "partial", "failed"])
          .optional()
          .describe("Filter by cascade status (default: all)"),
      },
    },
    async ({ status }) => {
      const all = client.compliance.listDeletionHistory();
      const filtered = !status || status === "all" ? all : all.filter((r) => r.status === status);
      const summary = filtered.map((r) => ({
        userId: r.userId,
        status: r.status,
        completedAt: r.completedAt,
        adapterCount: r.adapterResults.length,
        rootHash: r.auditRootHash,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: summary.length, requests: summary }, null, 2) }],
        structuredContent: { count: summary.length, requests: summary },
      };
    },
  );

  server.registerTool(
    "selfheal_check_compliance_status",
    {
      title: "Check whether a user has been erased",
      description:
        "Returns the latest known erasure status for a user. Result.compliant is true only when every adapter reported success on the most recent run.",
      inputSchema: {
        user_id: z.string().min(1).describe("Internal user identifier"),
      },
    },
    async ({ user_id }) => {
      const record = client.compliance.getDeletionRecord(user_id);
      const payload = record
        ? {
            user_id,
            erased: true,
            compliant: record.status === "success",
            status: record.status,
            completedAt: record.completedAt,
            rootHash: record.auditRootHash,
            failedAdapters: record.adapterResults
              .filter((r) => r.status === "failed")
              .map((r) => r.adapter),
          }
        : { user_id, erased: false, compliant: false, status: "unknown" as const };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  return server;
}
