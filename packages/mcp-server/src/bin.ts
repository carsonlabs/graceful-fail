#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { selfheal } from "@selfheal/sdk";
import type { ComplianceConfig } from "@selfheal/sdk";
import { buildMcpServer } from "./server.js";

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
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
    "selfheal-mcp: SELFHEAL_PG_URL is set but the 'pg' package is not installed. Run: pnpm add pg @types/pg",
  );
  const client = new mod.default.Client({ connectionString });
  await client.connect();
  return client;
}

async function buildPineconeIndex(apiKey: string, indexName: string) {
  const mod = await loadOptional<PineconeModule>(
    "@pinecone-database/pinecone",
    "selfheal-mcp: SELFHEAL_PINECONE_API_KEY is set but '@pinecone-database/pinecone' is not installed.",
  );
  const pc = new mod.Pinecone({ apiKey });
  return pc.index(indexName);
}

async function buildConfigFromEnv(): Promise<ComplianceConfig> {
  const config: ComplianceConfig = {};

  const pgUrl = process.env.SELFHEAL_PG_URL;
  const pgRules = process.env.SELFHEAL_PG_RULES;
  if (pgUrl && pgRules) {
    const rules = JSON.parse(pgRules) as Array<{
      table: string;
      userIdColumn: string;
      schema?: string;
    }>;
    const client = await buildPostgresClient(pgUrl);
    config.postgres = { client, rules };
  }

  const pgvUrl = process.env.SELFHEAL_PGVECTOR_URL ?? pgUrl;
  const pgvTable = process.env.SELFHEAL_PGVECTOR_TABLE;
  const pgvCol = process.env.SELFHEAL_PGVECTOR_USER_COLUMN ?? "user_id";
  if (pgvUrl && pgvTable) {
    const client = pgvUrl === pgUrl && config.postgres?.client
      ? config.postgres.client
      : await buildPostgresClient(pgvUrl);
    config.pgvector = { client, table: pgvTable, userIdColumn: pgvCol };
  }

  const pineKey = process.env.SELFHEAL_PINECONE_API_KEY;
  const pineIndex = process.env.SELFHEAL_PINECONE_INDEX;
  const pineMetaKey = process.env.SELFHEAL_PINECONE_METADATA_KEY ?? "user_id";
  if (pineKey && pineIndex) {
    const index = await buildPineconeIndex(pineKey, pineIndex);
    config.pinecone = { index, metadataKey: pineMetaKey };
  }

  if (!config.postgres && !config.pgvector && !config.pinecone) {
    throw new Error(
      "selfheal-mcp: no adapters configured. Set at least one of SELFHEAL_PG_URL+SELFHEAL_PG_RULES, SELFHEAL_PGVECTOR_TABLE, or SELFHEAL_PINECONE_API_KEY+SELFHEAL_PINECONE_INDEX.",
    );
  }
  return config;
}

async function main() {
  const apiKey = process.env.SELFHEAL_API_KEY;
  if (!apiKey) {
    throw new Error("selfheal-mcp: SELFHEAL_API_KEY is required");
  }
  const auditSecret = process.env.SELFHEAL_AUDIT_SECRET;

  const client = selfheal({ apiKey, auditSecret });
  client.compliance.configure(await buildConfigFromEnv());

  const server = buildMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
