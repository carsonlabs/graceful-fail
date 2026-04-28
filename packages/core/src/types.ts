export type EraseReason =
  | "gdpr_article_17"
  | "ccpa_delete"
  | "ca_delete_act"
  | "user_request"
  | "internal";

export interface EraseInput {
  userId: string;
  reason?: EraseReason;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
}

export type AdapterStatus = "success" | "failed" | "partial";

export interface AdapterResult {
  adapter: string;
  status: AdapterStatus;
  recordsAffected: number;
  startedAt: string;
  finishedAt: string;
  attempts: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface Adapter {
  readonly name: string;
  erase(input: EraseInput): Promise<Omit<AdapterResult, "adapter" | "startedAt" | "finishedAt" | "attempts">>;
}

export type CascadeStatus = "success" | "partial" | "failed";

export interface CascadeResult {
  userId: string;
  status: CascadeStatus;
  startedAt: string;
  completedAt: string;
  reason?: EraseReason;
  requestedBy?: string;
  adapterResults: AdapterResult[];
  auditRootHash: string;
}

export type AuditEvent =
  | "cascade.started"
  | "cascade.completed"
  | "adapter.started"
  | "adapter.succeeded"
  | "adapter.failed"
  | "adapter.retrying";

export interface AuditEntry {
  index: number;
  timestamp: string;
  event: AuditEvent;
  userId: string;
  prevHash: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  entryHash: string;
  signature: string;
}

export interface DeletionProof {
  userId: string;
  status: CascadeStatus;
  startedAt: string;
  completedAt: string;
  adapterResults: AdapterResult[];
  auditEntries: AuditEntry[];
  rootHash: string;
  signedReceipt: string;
  signatureAlgorithm: "HMAC-SHA256";
}
