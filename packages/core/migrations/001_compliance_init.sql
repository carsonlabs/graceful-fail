-- selfheal v2 compliance module — initial schema
-- Postgres / Supabase. Tables are prefixed `selfheal_` so they coexist
-- safely with v1 schemas in a shared database.

CREATE TABLE IF NOT EXISTS selfheal_audit_entries (
  id            BIGSERIAL PRIMARY KEY,
  "index"       INTEGER NOT NULL,
  -- ts is stored as TEXT (ISO 8601) to guarantee byte-exact preservation
  -- of the timestamp included in the entry hash. A separate ts_at TIMESTAMPTZ
  -- is provided for range queries / indexing without affecting hash inputs.
  ts            TEXT NOT NULL,
  ts_at         TIMESTAMPTZ NOT NULL,
  event         TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  prev_hash     TEXT NOT NULL,
  payload       JSONB NOT NULL,
  payload_hash  TEXT NOT NULL,
  entry_hash    TEXT NOT NULL UNIQUE,
  signature     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_selfheal_audit_user_index
  ON selfheal_audit_entries (user_id, "index" ASC);

CREATE INDEX IF NOT EXISTS idx_selfheal_audit_global_index
  ON selfheal_audit_entries ("index" ASC);

CREATE INDEX IF NOT EXISTS idx_selfheal_audit_ts_at
  ON selfheal_audit_entries (ts_at DESC);

CREATE TABLE IF NOT EXISTS selfheal_deletion_requests (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  status            TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  completed_at      TIMESTAMPTZ NOT NULL,
  reason            TEXT,
  requested_by      TEXT,
  audit_root_hash   TEXT NOT NULL,
  adapter_results   JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_selfheal_dr_user_completed
  ON selfheal_deletion_requests (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_selfheal_dr_status
  ON selfheal_deletion_requests (status);
