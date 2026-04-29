import type { AuditEntry } from "../types.js";
import type { AuditStore } from "../audit.js";
import type { CascadeResult } from "../types.js";

export interface SqlClient {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface SqlStoreOptions {
  client: SqlClient;
  auditTable?: string;
  historyTable?: string;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function safeIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`Unsafe table name: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

interface AuditRow {
  index: number;
  ts: string;
  event: string;
  user_id: string;
  prev_hash: string;
  payload: unknown;
  payload_hash: string;
  entry_hash: string;
  signature: string;
}

function rowToEntry(row: AuditRow): AuditEntry {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>);
  return {
    index: Number(row.index),
    timestamp: row.ts,
    event: row.event as AuditEntry["event"],
    userId: row.user_id,
    prevHash: row.prev_hash,
    payload,
    payloadHash: row.payload_hash,
    entryHash: row.entry_hash,
    signature: row.signature,
  };
}

export class SqlAuditStore implements AuditStore {
  private readonly table: string;

  constructor(private readonly opts: SqlStoreOptions) {
    this.table = safeIdent(opts.auditTable ?? "selfheal_audit_entries");
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.opts.client.query(
      `INSERT INTO ${this.table}
        ("index", ts, ts_at, event, user_id, prev_hash, payload, payload_hash, entry_hash, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [
        entry.index,
        entry.timestamp,
        entry.timestamp,
        entry.event,
        entry.userId,
        entry.prevHash,
        JSON.stringify(entry.payload),
        entry.payloadHash,
        entry.entryHash,
        entry.signature,
      ],
    );
  }

  async list(filter?: { userId?: string }): Promise<AuditEntry[]> {
    const sql = filter?.userId
      ? `SELECT "index", ts, event, user_id, prev_hash, payload, payload_hash, entry_hash, signature
           FROM ${this.table} WHERE user_id = $1 ORDER BY "index" ASC`
      : `SELECT "index", ts, event, user_id, prev_hash, payload, payload_hash, entry_hash, signature
           FROM ${this.table} ORDER BY "index" ASC`;
    const values = filter?.userId ? [filter.userId] : [];
    const res = await this.opts.client.query<AuditRow>(sql, values);
    return res.rows.map(rowToEntry);
  }

  async tail(): Promise<AuditEntry | null> {
    const res = await this.opts.client.query<AuditRow>(
      `SELECT "index", ts, event, user_id, prev_hash, payload, payload_hash, entry_hash, signature
         FROM ${this.table} ORDER BY "index" DESC LIMIT 1`,
    );
    if (res.rows.length === 0) return null;
    return rowToEntry(res.rows[0]);
  }
}

interface HistoryRow {
  user_id: string;
  status: string;
  started_at: Date | string;
  completed_at: Date | string;
  reason: string | null;
  requested_by: string | null;
  audit_root_hash: string;
  adapter_results: unknown;
}

function rowToCascade(row: HistoryRow): CascadeResult {
  const startedAt = row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at);
  const completedAt = row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at);
  const adapterResults = typeof row.adapter_results === "string"
    ? JSON.parse(row.adapter_results)
    : (row.adapter_results as CascadeResult["adapterResults"]);
  return {
    userId: row.user_id,
    status: row.status as CascadeResult["status"],
    startedAt,
    completedAt,
    reason: (row.reason ?? undefined) as CascadeResult["reason"],
    requestedBy: row.requested_by ?? undefined,
    auditRootHash: row.audit_root_hash,
    adapterResults,
  };
}

export interface HistoryStore {
  record(cascade: CascadeResult): Promise<void>;
  latest(userId: string): Promise<CascadeResult | null>;
  list(filter?: { status?: CascadeResult["status"] }): Promise<CascadeResult[]>;
}

export class InMemoryHistoryStore implements HistoryStore {
  private readonly entries: CascadeResult[] = [];
  async record(cascade: CascadeResult): Promise<void> {
    this.entries.push(cascade);
  }
  async latest(userId: string): Promise<CascadeResult | null> {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].userId === userId) return this.entries[i];
    }
    return null;
  }
  async list(filter?: { status?: CascadeResult["status"] }): Promise<CascadeResult[]> {
    const sorted = [...this.entries].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    if (!filter?.status) return sorted;
    return sorted.filter((e) => e.status === filter.status);
  }
}

export class SqlHistoryStore implements HistoryStore {
  private readonly table: string;

  constructor(private readonly opts: SqlStoreOptions) {
    this.table = safeIdent(opts.historyTable ?? "selfheal_deletion_requests");
  }

  async record(cascade: CascadeResult): Promise<void> {
    await this.opts.client.query(
      `INSERT INTO ${this.table}
         (user_id, status, started_at, completed_at, reason, requested_by, audit_root_hash, adapter_results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        cascade.userId,
        cascade.status,
        cascade.startedAt,
        cascade.completedAt,
        cascade.reason ?? null,
        cascade.requestedBy ?? null,
        cascade.auditRootHash,
        JSON.stringify(cascade.adapterResults),
      ],
    );
  }

  async latest(userId: string): Promise<CascadeResult | null> {
    const res = await this.opts.client.query<HistoryRow>(
      `SELECT user_id, status, started_at, completed_at, reason, requested_by, audit_root_hash, adapter_results
         FROM ${this.table} WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    return rowToCascade(res.rows[0]);
  }

  async list(filter?: { status?: CascadeResult["status"] }): Promise<CascadeResult[]> {
    const sql = filter?.status
      ? `SELECT user_id, status, started_at, completed_at, reason, requested_by, audit_root_hash, adapter_results
           FROM ${this.table} WHERE status = $1 ORDER BY completed_at DESC`
      : `SELECT user_id, status, started_at, completed_at, reason, requested_by, audit_root_hash, adapter_results
           FROM ${this.table} ORDER BY completed_at DESC`;
    const values = filter?.status ? [filter.status] : [];
    const res = await this.opts.client.query<HistoryRow>(sql, values);
    return res.rows.map(rowToCascade);
  }
}
