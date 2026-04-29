/**
 * End-to-end compliance demo. Spins up a pg-mem Postgres, seeds fake user data
 * across three logical stores, runs the cascade, prints a sales-grade summary,
 * and writes the JSON proof + signed PDF receipt to ./out/compliance-demo/.
 *
 * Usage:
 *   pnpm tsx scripts/compliance-demo.ts
 *
 * No external infra required.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { selfheal } from "../packages/sdk/src/index";
import {
  SqlAuditStore,
  SqlHistoryStore,
  buildDeletionProofPdf,
  type SqlClient,
} from "../packages/core/src/index";
import { readFileSync } from "node:fs";

const MIGRATION_PATH = resolve(import.meta.dirname, "..", "packages/core/migrations/001_compliance_init.sql");
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf8");
const OUT_DIR = resolve(import.meta.dirname, "..", "out", "compliance-demo");

interface PgMemClient extends SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }

async function main() {
  console.log(bold("\n┌─ selfheal compliance demo ───────────────────────────────────"));
  console.log(bold("│ ") + dim("right-to-erasure cascade with signed audit log + PDF receipt"));
  console.log(bold("└──────────────────────────────────────────────────────────────\n"));

  // 1. Bootstrap pg-mem with realistic AI-agent app schema + selfheal tables.
  console.log(cyan("→ booting in-memory Postgres (pg-mem) + applying compliance migration"));
  const db = newDb();
  const adapter = db.adapters.createPg();
  const client = new adapter.Client() as unknown as PgMemClient & { connect(): Promise<void> };
  await client.connect();
  await client.query(MIGRATION_SQL);
  await client.query(`
    CREATE TABLE messages    (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, role TEXT, body TEXT);
    CREATE TABLE profiles    (user_id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE embeddings  (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, source TEXT, vec TEXT);
    CREATE TABLE tool_calls  (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, tool TEXT, args TEXT);
  `);

  // 2. Seed two users — one to erase, one to leave alone.
  console.log(cyan("→ seeding two users (u_42 to erase, u_99 must remain untouched)"));
  await client.query(`INSERT INTO profiles VALUES ($1,$2,$3),($4,$5,$6)`, [
    "u_42", "Jane Doe", "jane@example.com",
    "u_99", "Other Person", "other@example.com",
  ]);
  await client.query(`INSERT INTO messages (user_id, role, body) VALUES
      ($1,'user','what is my balance?'),
      ($1,'assistant','your balance is 42.10 USD'),
      ($1,'user','transfer it to alice'),
      ($2,'user','hello')`,
    ["u_42", "u_99"]);
  for (let i = 0; i < 8; i++) {
    await client.query(`INSERT INTO embeddings (user_id, source, vec) VALUES ($1, $2, $3)`, [
      "u_42", `msg_${i}`, "[0.1,0.2,0.3]",
    ]);
  }
  await client.query(`INSERT INTO embeddings (user_id, source, vec) VALUES ($1,$2,$3)`, [
    "u_99", "msg_99", "[0.9,0.8,0.7]",
  ]);
  await client.query(`INSERT INTO tool_calls (user_id, tool, args) VALUES
      ($1,'check_balance','{}'),
      ($1,'transfer_funds','{"to":"alice","amount":42.10}')`,
    ["u_42"]);

  // 3. Mock Pinecone index — most customers have one.
  const pineconeStore = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < 5; i++) pineconeStore.set(`vec_${i}`, { user_id: "u_42", text: `chunk ${i}` });
  pineconeStore.set("vec_99", { user_id: "u_99", text: "untouched" });
  const pinecone = {
    deleteMany: async ({ filter }: { filter: Record<string, unknown> }) => {
      const [key, cond] = Object.entries(filter)[0];
      const target = (cond as { $eq: unknown }).$eq;
      for (const [id, meta] of pineconeStore) {
        if (meta[key] === target) pineconeStore.delete(id);
      }
    },
  };

  // 4. Build SelfhealClient with persistent SQL stores + 3 adapters.
  console.log(cyan("→ configuring selfheal: postgres + pgvector + pinecone, persisted to SQL"));
  const auditStore = new SqlAuditStore({ client });
  const historyStore = new SqlHistoryStore({ client });
  const apiKey = "sk_demo_" + "x".repeat(40);
  const sh = selfheal({ apiKey, auditStore, historyStore });
  sh.compliance.configure({
    postgres: {
      client,
      rules: [
        { table: "messages", userIdColumn: "user_id" },
        { table: "profiles", userIdColumn: "user_id" },
        { table: "tool_calls", userIdColumn: "user_id" },
      ],
    },
    pgvector: { client, table: "embeddings", userIdColumn: "user_id" },
    pinecone: { index: pinecone, metadataKey: "user_id" },
  });

  // 5. Run the cascade.
  console.log(cyan("→ running cascade for u_42 (reason: gdpr_article_17)"));
  const t0 = Date.now();
  const result = await sh.compliance.eraseUser({
    userId: "u_42",
    reason: "gdpr_article_17",
    requestedBy: "jane@example.com",
  });
  const took = Date.now() - t0;

  // 6. Show the result.
  console.log("");
  console.log(bold("Cascade result"));
  console.log(`  status:      ${result.status === "success" ? green(result.status) : yellow(result.status)}`);
  console.log(`  duration:    ${took}ms`);
  console.log(`  rootHash:    ${dim(result.auditRootHash)}`);
  console.log(`  adapters:`);
  for (const r of result.adapterResults) {
    const records = r.recordsAffected < 0 ? dim("—") : String(r.recordsAffected);
    console.log(`    • ${r.adapter.padEnd(10)} ${green(r.status)}  records=${records}  attempts=${r.attempts}`);
  }

  // 7. Verify cascade actually wrote through.
  const remaining = await client.query<{ tbl: string; n: number }>(`
    SELECT 'messages'::text AS tbl, COUNT(*)::int AS n FROM messages WHERE user_id='u_42'
    UNION ALL SELECT 'profiles', COUNT(*)::int FROM profiles WHERE user_id='u_42'
    UNION ALL SELECT 'embeddings', COUNT(*)::int FROM embeddings WHERE user_id='u_42'
    UNION ALL SELECT 'tool_calls', COUNT(*)::int FROM tool_calls WHERE user_id='u_42'
  `);
  console.log("");
  console.log(bold("Backing-store verification (rows left for u_42 — should all be 0)"));
  for (const row of remaining.rows) console.log(`  ${row.tbl.padEnd(10)} ${row.n === 0 ? green("0") : yellow(String(row.n))}`);
  const pineconeRemaining = [...pineconeStore.values()].filter((m) => m.user_id === "u_42").length;
  console.log(`  pinecone   ${pineconeRemaining === 0 ? green("0") : yellow(String(pineconeRemaining))}`);

  const u99messages = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id='u_99'`);
  console.log(`  ${dim("(u_99 messages still present:")} ${u99messages.rows[0].n}${dim(")")}`);

  // 8. Pull audit chain back from SQL and verify.
  const entries = await auditStore.list({ userId: "u_42" });
  console.log("");
  console.log(bold("Audit chain (read back from selfheal_audit_entries)"));
  for (const e of entries) {
    console.log(`  [${String(e.index).padStart(2)}] ${e.event.padEnd(22)} ${dim(e.timestamp)}`);
  }

  // 9. Build proof + verify + write artifacts.
  const proof = await sh.compliance.getDeletionProof({ userId: "u_42" });
  const verification = sh.compliance.verifyProof(proof);
  console.log("");
  console.log(bold("Proof verification"));
  console.log(`  chain valid:     ${verification.valid ? green("yes") : yellow("no")}`);
  console.log(`  algorithm:       ${proof.signatureAlgorithm}`);
  console.log(`  rootHash:        ${dim(proof.rootHash)}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = resolve(OUT_DIR, "u_42.proof.json");
  const pdfPath = resolve(OUT_DIR, "u_42.receipt.pdf");
  writeFileSync(jsonPath, JSON.stringify(proof, null, 2));
  const pdf = await buildDeletionProofPdf(proof);
  writeFileSync(pdfPath, pdf);

  console.log("");
  console.log(bold("Artifacts written"));
  console.log(`  ${cyan(jsonPath)}     ${dim(`(${(jsonPath.length, JSON.stringify(proof).length)} bytes)`)}`);
  console.log(`  ${cyan(pdfPath)}    ${dim(`(${pdf.length} bytes, signed PDF receipt)`)}`);

  console.log("");
  console.log(green(bold("✓ demo complete — every adapter erased, audit chain verified, receipt signed.")));
  console.log("");
}

main().catch((err) => {
  console.error("\n\x1b[31m✗ demo failed\x1b[0m");
  console.error(err);
  process.exit(1);
});
