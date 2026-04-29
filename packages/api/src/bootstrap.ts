import type { Express } from "express";
import { selfheal } from "@selfheal/sdk";
import type { ComplianceConfig } from "@selfheal/sdk";
import { SqlAuditStore, SqlHistoryStore, type SqlClient } from "@selfheal/core";
import { createComplianceRouter } from "./router.js";

interface PgClient extends SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
  end?(): Promise<void>;
}

type PgModule = { default: { Client: new (opts: { connectionString: string }) => PgClient & { connect(): Promise<void> } } };
type PineconeModule = { Pinecone: new (opts: { apiKey: string }) => { index(name: string): { deleteMany(arg: { filter: Record<string, unknown> }): Promise<unknown> } } };

async function loadOptional<T>(specifier: string, missingMsg: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch {
    throw new Error(missingMsg);
  }
}

async function buildPostgresClient(connectionString: string): Promise<PgClient> {
  const mod = await loadOptional<PgModule>(
    "pg",
    "selfheal-api: SELFHEAL_PG_URL is set but the 'pg' package is not installed. Run: pnpm add pg @types/pg",
  );
  const client = new mod.default.Client({ connectionString });
  await client.connect();
  return client;
}

async function buildPineconeIndex(apiKey: string, indexName: string) {
  const mod = await loadOptional<PineconeModule>(
    "@pinecone-database/pinecone",
    "selfheal-api: SELFHEAL_PINECONE_API_KEY is set but '@pinecone-database/pinecone' is not installed.",
  );
  const pc = new mod.Pinecone({ apiKey });
  return pc.index(indexName);
}

async function buildConfigFromEnv(env: NodeJS.ProcessEnv): Promise<{ config: ComplianceConfig; storeClient: PgClient | null }> {
  const config: ComplianceConfig = {};
  let storeClient: PgClient | null = null;

  const pgUrl = env.SELFHEAL_PG_URL;
  const pgRules = env.SELFHEAL_PG_RULES;
  if (pgUrl && pgRules) {
    const rules = JSON.parse(pgRules) as Array<{ table: string; userIdColumn: string; schema?: string }>;
    const client = await buildPostgresClient(pgUrl);
    storeClient = client;
    config.postgres = { client, rules };
  }

  const pgvUrl = env.SELFHEAL_PGVECTOR_URL ?? pgUrl;
  const pgvTable = env.SELFHEAL_PGVECTOR_TABLE;
  const pgvCol = env.SELFHEAL_PGVECTOR_USER_COLUMN ?? "user_id";
  if (pgvUrl && pgvTable) {
    const client = pgvUrl === pgUrl && config.postgres?.client
      ? (config.postgres.client as PgClient)
      : await buildPostgresClient(pgvUrl);
    if (!storeClient) storeClient = client;
    config.pgvector = { client, table: pgvTable, userIdColumn: pgvCol };
  }

  const pineKey = env.SELFHEAL_PINECONE_API_KEY;
  const pineIndex = env.SELFHEAL_PINECONE_INDEX;
  const pineMetaKey = env.SELFHEAL_PINECONE_METADATA_KEY ?? "user_id";
  if (pineKey && pineIndex) {
    const index = await buildPineconeIndex(pineKey, pineIndex);
    config.pinecone = { index, metadataKey: pineMetaKey };
  }

  return { config, storeClient };
}

export interface MountResult {
  enabled: boolean;
  reason?: string;
}

/**
 * Mounts the compliance API at `mountPath` if the environment is configured for
 * it. Returns `{ enabled: false }` (without throwing) when SELFHEAL_API_KEY is
 * missing — this lets the v1 server boot without the compliance module enabled.
 *
 * Throws if SELFHEAL_API_KEY is set but no adapters are configured, or if any
 * configured adapter's required env vars are malformed.
 */
export async function mountComplianceFromEnv(
  app: Express,
  mountPath = "/api/compliance",
  env: NodeJS.ProcessEnv = process.env,
): Promise<MountResult> {
  const apiKeysRaw = env.SELFHEAL_API_KEYS ?? env.SELFHEAL_API_KEY;
  if (!apiKeysRaw) return { enabled: false, reason: "SELFHEAL_API_KEY not set" };

  const apiKeys = apiKeysRaw.split(",").map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) return { enabled: false, reason: "SELFHEAL_API_KEY is empty" };

  const { config, storeClient } = await buildConfigFromEnv(env);
  if (!config.postgres && !config.pgvector && !config.pinecone) {
    throw new Error(
      "selfheal-api: SELFHEAL_API_KEY is set but no adapters are configured. Set at least one of " +
        "SELFHEAL_PG_URL+SELFHEAL_PG_RULES, SELFHEAL_PGVECTOR_TABLE, or SELFHEAL_PINECONE_API_KEY+SELFHEAL_PINECONE_INDEX.",
    );
  }

  const auditSecret = env.SELFHEAL_AUDIT_SECRET;
  const useSqlStores = env.SELFHEAL_PERSIST !== "false" && storeClient !== null;
  const auditStore = useSqlStores ? new SqlAuditStore({ client: storeClient! }) : undefined;
  const historyStore = useSqlStores ? new SqlHistoryStore({ client: storeClient! }) : undefined;

  const client = selfheal({ apiKey: apiKeys[0], auditSecret, auditStore, historyStore });
  client.compliance.configure(config);

  app.use(mountPath, createComplianceRouter({ client, apiKeys }));
  return { enabled: true };
}
