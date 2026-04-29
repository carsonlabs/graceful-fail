# @selfheal/core

Low-level engine for [`@selfheal/sdk`](https://www.npmjs.com/package/@selfheal/sdk). **Most users should install the SDK.** Install `@selfheal/core` directly only if you're building your own composition layer or need to extend the adapter / store interfaces.

```bash
pnpm add @selfheal/core
```

## What's inside

- `CascadeEngine` — runs an array of `Adapter` instances in parallel against an `EraseInput`, with retry-once + per-adapter timeout + partial-failure tolerance, writing every event into an `AuditLog`.
- `AuditLog` — HMAC-SHA256 chained tamper-evident log. Every `append()` call is serialized internally (concurrent adapter callers can't fork the chain) and includes `prevHash`, `payloadHash`, `entryHash`, and `signature`. `verify()` walks an array of entries and reports the first index where the chain breaks.
- `buildDeletionProof({ cascade, auditEntries, audit })` — packages a cascade result + audit chain into a verifiable `DeletionProof` with a base64 signed receipt envelope.
- `buildDeletionProofPdf(proof, branding?)` — renders the proof as a printable PDF for compliance auditors. Uses `pdfkit` with compression off so receipts are grep-able.
- Three reference adapters:
  - `PostgresAdapter` — multi-rule `DELETE` with identifier-safety guards.
  - `PgVectorAdapter` — single-table convenience over the same client.
  - `PineconeAdapter` — `deleteMany` by metadata filter.
- Stores:
  - `InMemoryAuditStore` / `InMemoryHistoryStore` — fine for dev/test.
  - `SqlAuditStore` / `SqlHistoryStore` — persist to any `pg`-compatible client (`pg`, `postgres-js`, `slonik`, pg-mem). Ships a migration SQL file at `migrations/001_compliance_init.sql`.

## Audit log integrity

```ts
import { AuditLog, InMemoryAuditStore } from "@selfheal/core";

const audit = new AuditLog(new InMemoryAuditStore(), process.env.AUDIT_SECRET!);
const a = await audit.append({ event: "cascade.started", userId: "u1", payload: { x: 1 } });
const b = await audit.append({ event: "cascade.completed", userId: "u1", payload: { ok: true } });

const entries = await audit.list({ userId: "u1" });
audit.verify(entries);  // { valid: true }

// Tamper detection — even if someone edits the row directly in the DB:
const tampered = entries.map((e, i) => i === 0 ? { ...e, payload: { x: 999 } } : e);
audit.verify(tampered);  // { valid: false, brokenAt: 0, reason: "payload_tampered" }
```

The verifier catches: payload edits, entry-hash mismatches, signature forgery from a different secret, removed entries (chain break), and index gaps. See `packages/core/test/audit.test.ts` and `sql-store.integration.test.ts` for the full assertion surface.

## Custom adapters

Any class implementing `Adapter` plugs into the cascade:

```ts
import type { Adapter, EraseInput, AdapterResult } from "@selfheal/core";

class WeaviateAdapter implements Adapter {
  readonly name = "weaviate";
  constructor(private readonly client: WeaviateClient, private readonly className: string) {}
  async erase(input: EraseInput) {
    const res = await this.client.batch.delete({
      class: this.className,
      where: { path: ["userId"], operator: "Equal", valueText: input.userId },
    });
    return { status: "success" as const, recordsAffected: res.results.successful };
  }
}

sh.compliance.configure({ custom: [new WeaviateAdapter(weaviate, "Memory")] });
```

## License

MIT © Carson Labs
