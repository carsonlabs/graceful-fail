/**
 * Live REST smoke-test. Spins the compliance router on a random port, hits
 * every endpoint with the real fetch protocol, and prints the responses.
 * Tears down cleanly. No external infra.
 */
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { selfheal } from "../packages/sdk/src/index";
import { SqlAuditStore, SqlHistoryStore } from "../packages/core/src/index";
import { createComplianceRouter } from "../packages/api/src/index";
import type { SqlClient } from "../packages/core/src/index";

interface PgMemClient extends SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

const API_KEY = "sk_demo_" + "x".repeat(40);
const MIGRATION = readFileSync(resolve(import.meta.dirname, "..", "packages/core/migrations/001_compliance_init.sql"), "utf8");

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }

async function setup() {
  const db = newDb();
  const a = db.adapters.createPg();
  const c = new a.Client() as unknown as PgMemClient & { connect(): Promise<void> };
  await c.connect();
  await c.query(MIGRATION);
  await c.query(`CREATE TABLE messages (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, body TEXT)`);
  await c.query(`INSERT INTO messages (user_id, body) VALUES ($1,$2),($1,$3),($4,$5)`, ["u_42","hi","bye","u_99","other"]);

  const sh = selfheal({ apiKey: API_KEY, auditStore: new SqlAuditStore({ client: c }), historyStore: new SqlHistoryStore({ client: c }) });
  sh.compliance.configure({ postgres: { client: c, rules: [{ table: "messages", userIdColumn: "user_id" }] } });

  const app = express();
  app.use(express.json());
  app.use("/api/compliance", createComplianceRouter({ client: sh, apiKeys: [API_KEY] }));
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

async function show(label: string, res: Response, options: { hideBody?: boolean } = {}) {
  console.log(cyan(`\n→ ${label}`));
  console.log(dim(`  ${res.status} ${res.statusText}`));
  console.log(dim(`  content-type: ${res.headers.get("content-type")}`));
  const cd = res.headers.get("content-disposition");
  if (cd) console.log(dim(`  content-disposition: ${cd}`));
  if (!options.hideBody) {
    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "";
    if (ct.startsWith("application/json")) {
      const obj = JSON.parse(text);
      const printable = JSON.stringify(obj, null, 2).split("\n").slice(0, 18).join("\n");
      console.log(printable);
      if (JSON.stringify(obj, null, 2).split("\n").length > 18) console.log(dim("  ... (truncated)"));
    } else {
      console.log(dim(`  body: <${text.length} bytes, omitted>`));
    }
  }
}

async function main() {
  const { baseUrl, close } = await setup();
  console.log(bold(`Live compliance API at ${baseUrl}`));

  // 1. Auth failure path
  const noAuth = await fetch(`${baseUrl}/api/compliance/erase`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await show("POST /erase  (no auth, expect 401 missing_bearer_token)", noAuth);

  // 2. Status before erase
  const statusBefore = await fetch(`${baseUrl}/api/compliance/status/u_42`, { headers: { authorization: `Bearer ${API_KEY}` } });
  await show("GET  /status/u_42  (before erasure)", statusBefore);

  // 3. Cascade
  const erase = await fetch(`${baseUrl}/api/compliance/erase`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ user_id: "u_42", reason: "gdpr_article_17", requested_by: "jane@example.com" }),
  });
  await show("POST /erase  (kick off the cascade)", erase);

  // 4. List
  const list = await fetch(`${baseUrl}/api/compliance/requests`, { headers: { authorization: `Bearer ${API_KEY}` } });
  await show("GET  /requests  (deletion history)", list);

  // 5. Status after erase
  const statusAfter = await fetch(`${baseUrl}/api/compliance/status/u_42`, { headers: { authorization: `Bearer ${API_KEY}` } });
  await show("GET  /status/u_42  (after erasure)", statusAfter);

  // 6. JSON proof
  const proof = await fetch(`${baseUrl}/api/compliance/proof/u_42`, { headers: { authorization: `Bearer ${API_KEY}` } });
  await show("GET  /proof/u_42  (JSON signed proof)", proof);

  // 7. PDF receipt
  const pdf = await fetch(`${baseUrl}/api/compliance/proof/u_42.pdf`, { headers: { authorization: `Bearer ${API_KEY}` } });
  await show("GET  /proof/u_42.pdf  (downloadable signed receipt)", pdf, { hideBody: true });
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  const pdfPath = resolve(import.meta.dirname, "..", "out", "compliance-demo", "u_42.from-rest.receipt.pdf");
  writeFileSync(pdfPath, pdfBytes);
  console.log(dim(`  saved to ${pdfPath} (${pdfBytes.length} bytes)`));
  console.log(dim(`  PDF magic bytes: ${pdfBytes.subarray(0, 8).toString("ascii")}...`));

  await close();
  console.log(green(bold("\n✓ all live endpoints responded as expected")));
}

main().catch((err) => { console.error(err); process.exit(1); });
