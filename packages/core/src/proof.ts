import type { AuditEntry, CascadeResult, DeletionProof } from "./types.js";
import { AuditLog } from "./audit.js";

export function buildDeletionProof(args: {
  cascade: CascadeResult;
  auditEntries: AuditEntry[];
  audit: AuditLog;
}): DeletionProof {
  const { cascade, auditEntries, audit } = args;

  if (auditEntries.length === 0) {
    throw new Error("Cannot build proof: no audit entries");
  }
  const verification = audit.verify(auditEntries);
  if (!verification.valid) {
    throw new Error(
      `Audit chain invalid for user ${cascade.userId} at index ${verification.brokenAt}: ${verification.reason}`,
    );
  }

  const rootHash = auditEntries[auditEntries.length - 1].entryHash;
  const receiptPayload = {
    userId: cascade.userId,
    status: cascade.status,
    startedAt: cascade.startedAt,
    completedAt: cascade.completedAt,
    rootHash,
    adapterCount: cascade.adapterResults.length,
    adapters: cascade.adapterResults.map((r) => ({
      name: r.adapter,
      status: r.status,
      recordsAffected: r.recordsAffected,
    })),
  };
  const signedReceipt = audit.signReceipt(receiptPayload);

  return {
    userId: cascade.userId,
    status: cascade.status,
    startedAt: cascade.startedAt,
    completedAt: cascade.completedAt,
    adapterResults: cascade.adapterResults,
    auditEntries,
    rootHash,
    signedReceipt,
    signatureAlgorithm: "HMAC-SHA256",
  };
}
