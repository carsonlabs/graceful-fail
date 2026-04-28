import type { Adapter, AdapterResult, EraseInput } from "../types.js";

export interface PgClientLike {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
}

export interface PostgresRule {
  table: string;
  userIdColumn: string;
  schema?: string;
}

export interface PostgresAdapterOptions {
  client: PgClientLike;
  rules: PostgresRule[];
  name?: string;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function qualifiedTable(rule: PostgresRule): string {
  return rule.schema ? `${quoteIdent(rule.schema)}.${quoteIdent(rule.table)}` : quoteIdent(rule.table);
}

export class PostgresAdapter implements Adapter {
  readonly name: string;
  private readonly rules: PostgresRule[];

  constructor(private readonly opts: PostgresAdapterOptions) {
    if (!opts.rules || opts.rules.length === 0) {
      throw new Error("PostgresAdapter requires at least one rule");
    }
    this.rules = opts.rules;
    this.name = opts.name ?? "postgres";
    for (const r of this.rules) {
      quoteIdent(r.table);
      quoteIdent(r.userIdColumn);
      if (r.schema) quoteIdent(r.schema);
    }
  }

  async erase(input: EraseInput): Promise<Omit<AdapterResult, "adapter" | "startedAt" | "finishedAt" | "attempts">> {
    let total = 0;
    const perTable: Record<string, number> = {};
    for (const rule of this.rules) {
      const sql = `DELETE FROM ${qualifiedTable(rule)} WHERE ${quoteIdent(rule.userIdColumn)} = $1`;
      const res = await this.opts.client.query(sql, [input.userId]);
      const affected = res.rowCount ?? 0;
      total += affected;
      perTable[rule.table] = affected;
    }
    return {
      status: "success",
      recordsAffected: total,
      details: { perTable },
    };
  }
}
