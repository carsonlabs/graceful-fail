import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { newDb } from "pg-mem";
import {
  AuditLog,
  CascadeEngine,
  PostgresAdapter,
  PgVectorAdapter,
  SqlAuditStore,
  SqlHistoryStore,
  buildDeletionProof,
  type SqlClient,
} from "@selfheal/core";

const SECRET = "a".repeat(48);
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dirname, "../migrations/001_compliance_init.sql");
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf8");

interface PgMemClient extends SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

async function freshDb(): Promise<{ client: PgMemClient }> {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const c = new adapter.Client();
  await c.connect();
  await c.query(MIGRATION_SQL);
  await c.query(`
    CREATE TABLE messages (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, body TEXT);
    CREATE TABLE profiles (user_id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE embeddings (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, vec TEXT);
  `);
  return { client: c as unknown as PgMemClient };
}

describe("SQL stores against real Postgres (pg-mem)", () => {
  let client: PgMemClient;

  beforeEach(async () => {
    ({ client } = await freshDb());
  });

  it("persists a full cascade and reads back a verifiable audit chain", async () => {
    await client.query(`INSERT INTO messages (user_id, body) VALUES ($1,$2),($1,$3),($4,$5)`, [
      "u_42",
      "hi",
      "bye",
      "u_99",
      "untouched",
    ]);
    await client.query(`INSERT INTO profiles (user_id, name) VALUES ($1,$2),($3,$4)`, [
      "u_42",
      "Jane",
      "u_99",
      "Other",
    ]);
    await client.query(`INSERT INTO embeddings (user_id, vec) VALUES ($1,$2),($1,$3),($4,$5)`, [
      "u_42",
      "v1",
      "v2",
      "u_99",
      "v3",
    ]);

    const auditStore = new SqlAuditStore({ client });
    const historyStore = new SqlHistoryStore({ client });
    const audit = new AuditLog(auditStore, SECRET);

    const engine = new CascadeEngine(
      [
        new PostgresAdapter({
          client,
          rules: [
            { table: "messages", userIdColumn: "user_id" },
            { table: "profiles", userIdColumn: "user_id" },
          ],
        }),
        new PgVectorAdapter({ client, table: "embeddings", userIdColumn: "user_id" }),
      ],
      audit,
      { retryDelayMs: 1 },
    );

    const result = await engine.erase({
      userId: "u_42",
      reason: "gdpr_article_17",
      requestedBy: "jane@example.com",
    });
    await historyStore.record(result);

    expect(result.status).toBe("success");
    const pgAdapterResult = result.adapterResults.find((r) => r.adapter === "postgres")!;
    expect(pgAdapterResult.recordsAffected).toBe(3);
    const pgvAdapterResult = result.adapterResults.find((r) => r.adapter === "pgvector")!;
    expect(pgvAdapterResult.recordsAffected).toBe(2);

    const remainingMessages = await client.query<{ user_id: string }>(`SELECT user_id FROM messages`);
    expect(remainingMessages.rows.map((r) => r.user_id)).toEqual(["u_99"]);
    const remainingEmbeddings = await client.query<{ user_id: string }>(`SELECT user_id FROM embeddings`);
    expect(remainingEmbeddings.rows.map((r) => r.user_id)).toEqual(["u_99"]);

    const persistedEntries = await auditStore.list({ userId: "u_42" });
    expect(persistedEntries.length).toBeGreaterThan(0);
    expect(persistedEntries[0].event).toBe("cascade.started");
    expect(persistedEntries[persistedEntries.length - 1].event).toBe("cascade.completed");
    expect(audit.verify(persistedEntries).valid).toBe(true);

    const proof = buildDeletionProof({ cascade: result, auditEntries: persistedEntries, audit });
    expect(proof.rootHash).toBe(result.auditRootHash);
    expect(audit.verifyReceipt(proof.signedReceipt).valid).toBe(true);

    const persistedHistory = await historyStore.latest("u_42");
    expect(persistedHistory).not.toBeNull();
    expect(persistedHistory!.status).toBe("success");
    expect(persistedHistory!.auditRootHash).toBe(result.auditRootHash);
  });

  it("records multiple cascades and returns the most recent for a user", async () => {
    const auditStore = new SqlAuditStore({ client });
    const historyStore = new SqlHistoryStore({ client });
    const audit = new AuditLog(auditStore, SECRET);
    const engine = new CascadeEngine(
      [new PostgresAdapter({ client, rules: [{ table: "messages", userIdColumn: "user_id" }] })],
      audit,
      { retryDelayMs: 1 },
    );

    const r1 = await engine.erase({ userId: "u_1" });
    await historyStore.record(r1);
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await engine.erase({ userId: "u_1" });
    await historyStore.record(r2);

    const latest = await historyStore.latest("u_1");
    expect(latest!.completedAt).toBe(r2.completedAt);

    const all = await historyStore.list();
    expect(all).toHaveLength(2);
  });

  it("filters history by status", async () => {
    const auditStore = new SqlAuditStore({ client });
    const historyStore = new SqlHistoryStore({ client });
    const audit = new AuditLog(auditStore, SECRET);
    const engine = new CascadeEngine(
      [new PostgresAdapter({ client, rules: [{ table: "messages", userIdColumn: "user_id" }] })],
      audit,
      { retryDelayMs: 1 },
    );
    const ok = await engine.erase({ userId: "u_ok" });
    await historyStore.record(ok);
    await historyStore.record({ ...ok, userId: "u_failed", status: "failed" });

    const failed = await historyStore.list({ status: "failed" });
    expect(failed.map((r) => r.userId)).toEqual(["u_failed"]);
    const successes = await historyStore.list({ status: "success" });
    expect(successes.map((r) => r.userId)).toEqual(["u_ok"]);
  });

  it("the persisted entry_hash UNIQUE constraint prevents duplicate audit insertion", async () => {
    const auditStore = new SqlAuditStore({ client });
    const audit = new AuditLog(auditStore, SECRET);
    const entry = await audit.append({ event: "cascade.started", userId: "u_dup", payload: {} });
    await expect(auditStore.append(entry)).rejects.toThrow();
  });

  it("rejects unsafe table names at construction", () => {
    expect(() => new SqlAuditStore({ client, auditTable: "ev'il" })).toThrow(/Unsafe/);
    expect(() => new SqlHistoryStore({ client, historyTable: "ev'il" })).toThrow(/Unsafe/);
  });

  it("the persisted audit chain still verifies after retrieval, proving HMAC + chain travel intact through SQL", async () => {
    const auditStore = new SqlAuditStore({ client });
    const audit = new AuditLog(auditStore, SECRET);
    await audit.append({ event: "cascade.started", userId: "u_v", payload: { a: 1 } });
    await audit.append({ event: "adapter.succeeded", userId: "u_v", payload: { adapter: "x" } });
    await audit.append({ event: "cascade.completed", userId: "u_v", payload: { status: "success" } });

    const entries = await auditStore.list({ userId: "u_v" });
    expect(audit.verify(entries).valid).toBe(true);

    // Now tamper at the SQL level — flip the payload of one row directly.
    await client.query(
      `UPDATE selfheal_audit_entries SET payload = $1::jsonb WHERE user_id = $2 AND event = $3`,
      [JSON.stringify({ adapter: "x", recordsAffected: 999999 }), "u_v", "adapter.succeeded"],
    );
    const tampered = await auditStore.list({ userId: "u_v" });
    const v = audit.verify(tampered);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("payload_tampered");
  });
});
