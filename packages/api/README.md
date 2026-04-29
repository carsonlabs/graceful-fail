# @selfheal/api

Express router exposing the [`@selfheal/sdk`](https://www.npmjs.com/package/@selfheal/sdk) compliance cascade over HTTP. **Drop into any Express app and you've shipped GDPR/CCPA right-to-erasure with bearer-token auth, a signed audit trail, and a printable PDF receipt.**

```bash
pnpm add @selfheal/api express
```

## Endpoints

| Method | Path | Effect |
|---|---|---|
| `POST` | `/erase` | Cascades a deletion. Returns 200 on success/partial. |
| `GET` | `/proof/:userId` | Signed JSON deletion proof. |
| `GET` | `/proof/:userId.pdf` | Same proof rendered as a printable PDF receipt. |
| `GET` | `/requests?status=...` | Deletion history, filterable by `success` / `partial` / `failed`. |
| `GET` | `/status/:userId` | Latest compliance status for a user. |

Auth: `Authorization: Bearer <api-key>` matched against your configured allowlist in constant time. 401 paths split into `missing_bearer_token` vs `invalid_api_key` so clients can self-diagnose.

## Quick start

```ts
import express from "express";
import { selfheal } from "@selfheal/sdk";
import { createComplianceRouter } from "@selfheal/api";

const sh = selfheal({ apiKey: process.env.SELFHEAL_API_KEY! });
sh.compliance.configure({ /* postgres / pgvector / pinecone */ });

const app = express();
app.use(express.json());
app.use(
  "/api/compliance",
  createComplianceRouter({ client: sh, apiKeys: [process.env.SELFHEAL_API_KEY!] }),
);
app.listen(3000);
```

## Env-driven bootstrap

Skip the wiring if you'd rather configure adapters from environment variables:

```ts
import { mountComplianceFromEnv } from "@selfheal/api";

const result = await mountComplianceFromEnv(app, "/api/compliance");
if (!result.enabled) console.log(`compliance disabled: ${result.reason}`);
```

Reads:

| Env var | Effect |
|---|---|
| `SELFHEAL_API_KEY` (or `SELFHEAL_API_KEYS` for comma-separated list) | Bearer-token allowlist. Required to enable. Unset → router is not mounted. |
| `SELFHEAL_AUDIT_SECRET` | HMAC secret for the audit log. Defaults to a derivation of the API key. **Set this explicitly in production.** |
| `SELFHEAL_PG_URL` + `SELFHEAL_PG_RULES` | Postgres adapter. Rules JSON: `[{"table":"messages","userIdColumn":"user_id"}, ...]`. |
| `SELFHEAL_PGVECTOR_TABLE` (+ optional `_URL`, `_USER_COLUMN`) | pgvector adapter. |
| `SELFHEAL_PINECONE_API_KEY` + `SELFHEAL_PINECONE_INDEX` | Pinecone adapter (+ optional `_METADATA_KEY`, default `user_id`). |
| `SELFHEAL_PERSIST` | `false` to use in-memory stores (dev only). Default: persist via `SqlAuditStore` + `SqlHistoryStore`. |

If `SELFHEAL_API_KEY` is set but no adapters are configured, the bootstrap **throws at startup** rather than running with broken config.

## OpenAPI

The package exports OpenAPI 3.1 fragments so you can advertise the endpoints in your existing spec:

```ts
import {
  complianceOpenApiPaths,
  complianceOpenApiSchemas,
  complianceOpenApiTag,
} from "@selfheal/api";

const spec = buildYourSpec();
Object.assign(spec.paths, complianceOpenApiPaths());
Object.assign(spec.components.schemas, complianceOpenApiSchemas());
spec.tags.push(complianceOpenApiTag);
```

## License

MIT © Carson Labs
