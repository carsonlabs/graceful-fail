import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "../src/server.js";
import { selfheal } from "@selfheal/sdk";

interface Row {
  user_id: string;
  [k: string]: unknown;
}

class FakePg {
  tables: Record<string, Row[]> = {};
  seed(table: string, rows: Row[]) {
    this.tables[table] = rows;
  }
  async query(sql: string, values?: unknown[]) {
    const m = /DELETE FROM "([^"]+)" WHERE "([^"]+)" = \$1/.exec(sql);
    if (!m) throw new Error(`unrecognized SQL: ${sql}`);
    const [, table, col] = m;
    const userId = (values ?? [])[0];
    const before = this.tables[table] ?? [];
    const after = before.filter((r) => r[col] !== userId);
    this.tables[table] = after;
    return { rowCount: before.length - after.length };
  }
}

async function setup() {
  const pg = new FakePg();
  pg.seed("messages", [
    { user_id: "u_42", body: "x" },
    { user_id: "u_99", body: "y" },
  ]);
  const sh = selfheal({ apiKey: "sk_test_" + "x".repeat(40) });
  sh.compliance.configure({
    postgres: { client: pg, rules: [{ table: "messages", userIdColumn: "user_id" }] },
  });
  const server = buildMcpServer({ client: sh });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, sh, pg };
}

function parseStructured(result: { structuredContent?: unknown; content: Array<{ type: string; text?: string }> }) {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content.find((c) => c.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

describe("MCP server", () => {
  it("exposes the four selfheal compliance tools", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "selfheal_check_compliance_status",
      "selfheal_erase_user",
      "selfheal_get_deletion_proof",
      "selfheal_list_pending_requests",
    ]);
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    }
  });

  it("erases a user via the MCP tool and writes through to the backing store", async () => {
    const { client, pg } = await setup();
    const result = await client.callTool({
      name: "selfheal_erase_user",
      arguments: { user_id: "u_42", reason: "gdpr_article_17", requested_by: "jane@example.com" },
    });
    const payload = parseStructured(result as never) as { status: string; adapterResults: Array<{ adapter: string; recordsAffected: number }> };
    expect(payload.status).toBe("success");
    expect(payload.adapterResults[0].adapter).toBe("postgres");
    expect(payload.adapterResults[0].recordsAffected).toBe(1);
    expect(pg.tables.messages).toEqual([{ user_id: "u_99", body: "y" }]);
  });

  it("returns a verifiable signed deletion proof", async () => {
    const { client, sh } = await setup();
    await client.callTool({
      name: "selfheal_erase_user",
      arguments: { user_id: "u_42" },
    });
    const result = await client.callTool({
      name: "selfheal_get_deletion_proof",
      arguments: { user_id: "u_42" },
    });
    const proof = parseStructured(result as never) as {
      userId: string;
      rootHash: string;
      signedReceipt: string;
      auditEntries: Array<{ event: string }>;
    };
    expect(proof.userId).toBe("u_42");
    expect(proof.signedReceipt).toBeTruthy();
    expect(proof.rootHash).toMatch(/^[0-9a-f]{64}$/);
    const verify = sh.compliance.verifyProof(proof as never);
    expect(verify.valid).toBe(true);
  });

  it("lists deletion history and filters by status", async () => {
    const { client } = await setup();
    await client.callTool({ name: "selfheal_erase_user", arguments: { user_id: "u_42" } });
    const all = parseStructured(
      (await client.callTool({ name: "selfheal_list_pending_requests", arguments: {} })) as never,
    ) as { count: number; requests: Array<{ userId: string; status: string }> };
    expect(all.count).toBe(1);
    expect(all.requests[0].userId).toBe("u_42");
    expect(all.requests[0].status).toBe("success");

    const failed = parseStructured(
      (await client.callTool({
        name: "selfheal_list_pending_requests",
        arguments: { status: "failed" },
      })) as never,
    ) as { count: number };
    expect(failed.count).toBe(0);
  });

  it("reports compliance status before and after erasure", async () => {
    const { client } = await setup();
    const before = parseStructured(
      (await client.callTool({
        name: "selfheal_check_compliance_status",
        arguments: { user_id: "u_42" },
      })) as never,
    ) as { erased: boolean; compliant: boolean; status: string };
    expect(before).toEqual({ user_id: "u_42", erased: false, compliant: false, status: "unknown" });

    await client.callTool({ name: "selfheal_erase_user", arguments: { user_id: "u_42" } });

    const after = parseStructured(
      (await client.callTool({
        name: "selfheal_check_compliance_status",
        arguments: { user_id: "u_42" },
      })) as never,
    ) as { erased: boolean; compliant: boolean; status: string; failedAdapters: string[] };
    expect(after.erased).toBe(true);
    expect(after.compliant).toBe(true);
    expect(after.status).toBe("success");
    expect(after.failedAdapters).toEqual([]);
  });
});
