import type { Adapter, AdapterResult, EraseInput } from "../types.js";
import type { PgClientLike } from "./postgres.js";

export interface PgVectorAdapterOptions {
  client: PgClientLike;
  table: string;
  userIdColumn: string;
  schema?: string;
  name?: string;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

export class PgVectorAdapter implements Adapter {
  readonly name: string;
  private readonly sql: string;

  constructor(private readonly opts: PgVectorAdapterOptions) {
    const table = opts.schema
      ? `${quoteIdent(opts.schema)}.${quoteIdent(opts.table)}`
      : quoteIdent(opts.table);
    this.sql = `DELETE FROM ${table} WHERE ${quoteIdent(opts.userIdColumn)} = $1`;
    this.name = opts.name ?? "pgvector";
  }

  async erase(input: EraseInput): Promise<Omit<AdapterResult, "adapter" | "startedAt" | "finishedAt" | "attempts">> {
    const res = await this.opts.client.query(this.sql, [input.userId]);
    return {
      status: "success",
      recordsAffected: res.rowCount ?? 0,
      details: { table: this.opts.table },
    };
  }
}
