# @selfheal/sdk

Production-grade right-to-erasure for AI agent stacks. **One API call cascades a GDPR/CCPA deletion across Postgres, pgvector, Pinecone, and your custom stores — and produces a cryptographically-signed audit trail you can hand to compliance auditors.**

```bash
pnpm add @selfheal/sdk
```

## Why

AI agent companies have user data scattered across Postgres + vector DBs + LLM logs + tool call traces and **no standard way to honor a deletion request across that stack**. Enterprise tools (BigID, etc.) cost too much. DIY is risky.

`@selfheal/sdk` is the indie/SMB lane: drop-in cascade engine + signed audit log, built for the stack you actually use.

## Quick start

```ts
import { selfheal } from "@selfheal/sdk";
import { Client as PgClient } from "pg";
import { Pinecone } from "@pinecone-database/pinecone";

const pg = new PgClient({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index("agent-memory");

const sh = selfheal({ apiKey: process.env.SELFHEAL_API_KEY! });

sh.compliance.configure({
  postgres: {
    client: pg,
    rules: [
      { table: "messages", userIdColumn: "user_id" },
      { table: "tool_calls", userIdColumn: "user_id" },
      { table: "profiles", userIdColumn: "user_id" },
    ],
  },
  pgvector: { client: pg, table: "embeddings", userIdColumn: "user_id" },
  pinecone: { index: pinecone, metadataKey: "user_id" },
});

// Erase
const result = await sh.compliance.eraseUser({
  userId: "user_123",
  reason: "gdpr_article_17",
  requestedBy: "jane@example.com",
});

// Compliance proof — verifiable, auditor-ready
const proof = await sh.compliance.getDeletionProof({ userId: "user_123" });
console.log(proof.signedReceipt);  // base64 HMAC-SHA256 envelope
console.log(proof.rootHash);        // anchor of the chained audit log
```

## What you get

- **Cascade orchestrator** — runs every adapter in parallel, retries once on failure, returns a per-adapter breakdown. Partial-failure tolerant: if pinecone is down but Postgres succeeded, you get `status: "partial"` with the failing adapter named, not silent data loss.
- **Tamper-evident audit log** — every event (cascade started, adapter started, adapter succeeded/failed, cascade completed) is HMAC-SHA256 signed and chained to the previous entry. Modify any past entry, even at the SQL level, and `verifyProof()` catches it.
- **Signed deletion proof** — `getDeletionProof({ userId })` returns a `DeletionProof` containing the full audit chain, per-adapter results, root hash, and a base64 signed receipt envelope. Pair with `@selfheal/core`'s `buildDeletionProofPdf(proof)` for a printable PDF.
- **Three adapters out of the box** — Postgres (multi-rule with SQL identifier safety), pgvector (single-table convenience), Pinecone (`deleteMany` by metadata filter). Custom adapters via the `Adapter` interface.

## Persistence

By default the audit log + history live in memory. For production:

```ts
import { SqlAuditStore, SqlHistoryStore } from "@selfheal/core";

const sh = selfheal({
  apiKey: process.env.SELFHEAL_API_KEY!,
  auditStore: new SqlAuditStore({ client: pg }),
  historyStore: new SqlHistoryStore({ client: pg }),
});
```

Migration SQL lives at `node_modules/@selfheal/core/migrations/001_compliance_init.sql`.

## See also

- [`@selfheal/api`](https://www.npmjs.com/package/@selfheal/api) — Express router exposing the SDK as REST endpoints.
- [`@selfheal/mcp-server`](https://www.npmjs.com/package/@selfheal/mcp-server) — MCP tools so your agents can trigger erasure themselves.
- [`@selfheal/core`](https://www.npmjs.com/package/@selfheal/core) — low-level engine (most users want the SDK).

## Compliance disclaimer

`@selfheal/sdk` deletes user data from configured data stores and produces a verifiable receipt of that deletion. It does **not** perform machine unlearning on already-trained models — that's a research-grade problem. The SDK records the deletion request as a documented event, which is what current regulatory guidance (CA Delete Act, EU AI Act) treats as compliant for trained models when paired with retraining/data-removal-from-training-set policies. Read the [compliance notes](https://selfheal.dev/compliance/disclaimer) for the full picture.

## License

MIT © Carson Labs
