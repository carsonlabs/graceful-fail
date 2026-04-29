import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { selfheal } from "@selfheal/sdk";
import { createComplianceRouter } from "../src/router.js";

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

const API_KEY = "sk_test_" + "x".repeat(40);

async function setup(): Promise<{
  baseUrl: string;
  pg: FakePg;
  close: () => Promise<void>;
}> {
  const pg = new FakePg();
  pg.seed("messages", [
    { user_id: "u_42", body: "hi" },
    { user_id: "u_42", body: "bye" },
    { user_id: "u_99", body: "x" },
  ]);
  const sh = selfheal({ apiKey: API_KEY });
  sh.compliance.configure({
    postgres: { client: pg, rules: [{ table: "messages", userIdColumn: "user_id" }] },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/compliance", createComplianceRouter({ client: sh, apiKeys: [API_KEY] }));
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    pg,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("Compliance REST API", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("rejects requests without a bearer token", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: "u_42" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "missing_bearer_token" });
  });

  it("rejects requests with a wrong API key", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ user_id: "u_42" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_api_key");
  });

  it("erases a user via POST /erase and returns the cascade result", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: "u_42", reason: "gdpr_article_17", requested_by: "jane@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; auditRootHash: string };
    expect(body.status).toBe("success");
    expect(body.auditRootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.pg.tables.messages).toEqual([{ user_id: "u_99", body: "x" }]);
  });

  it("validates the request body", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("invalid_body");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 404 for proof of an unknown user", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/proof/never-existed`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns a downloadable PDF receipt with the correct content-type and filename", async () => {
    await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: "u_42" }),
    });
    const res = await fetch(`${ctx.baseUrl}/api/compliance/proof/u_42.pdf`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("filename=\"selfheal-deletion-receipt-u_42.pdf\"");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(body.length).toBeGreaterThan(2000);
  });

  it("returns 404 for PDF receipt of an unknown user", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/compliance/proof/never-existed.pdf`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns a verifiable signed proof after erasure", async () => {
    await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: "u_42" }),
    });
    const res = await fetch(`${ctx.baseUrl}/api/compliance/proof/u_42`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const proof = (await res.json()) as {
      userId: string;
      rootHash: string;
      signedReceipt: string;
      auditEntries: Array<{ event: string }>;
    };
    expect(proof.userId).toBe("u_42");
    expect(proof.signedReceipt).toBeTruthy();
    expect(proof.auditEntries[0].event).toBe("cascade.started");
  });

  it("lists deletion history, filterable by status", async () => {
    await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: "u_42" }),
    });
    const all = await (
      await fetch(`${ctx.baseUrl}/api/compliance/requests`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      })
    ).json() as { count: number; requests: Array<{ userId: string; status: string }> };
    expect(all.count).toBe(1);
    expect(all.requests[0]).toMatchObject({ userId: "u_42", status: "success" });

    const failed = await (
      await fetch(`${ctx.baseUrl}/api/compliance/requests?status=failed`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      })
    ).json() as { count: number };
    expect(failed.count).toBe(0);
  });

  it("reports compliance status before and after erasure", async () => {
    const before = await (
      await fetch(`${ctx.baseUrl}/api/compliance/status/u_42`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      })
    ).json();
    expect(before).toEqual({ user_id: "u_42", erased: false, compliant: false, status: "unknown" });

    await fetch(`${ctx.baseUrl}/api/compliance/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: "u_42" }),
    });

    const after = (await (
      await fetch(`${ctx.baseUrl}/api/compliance/status/u_42`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      })
    ).json()) as { erased: boolean; compliant: boolean; status: string; failedAdapters: string[] };
    expect(after.erased).toBe(true);
    expect(after.compliant).toBe(true);
    expect(after.status).toBe("success");
    expect(after.failedAdapters).toEqual([]);
  });

  it("returns 207 (multi-status) when an adapter cascade is partial", async () => {
    const broken = {
      deleteMany: async () => {
        throw new Error("upstream is down");
      },
    };
    const sh = selfheal({ apiKey: API_KEY });
    sh.compliance.configure({
      postgres: { client: ctx.pg, rules: [{ table: "messages", userIdColumn: "user_id" }] },
      pinecone: { index: broken, metadataKey: "user_id" },
    });
    const app = express();
    app.use(express.json());
    app.use("/api/compliance", createComplianceRouter({ client: sh, apiKeys: [API_KEY] }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/compliance/erase`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ user_id: "u_42" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("partial");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
