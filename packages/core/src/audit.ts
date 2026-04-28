import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuditEntry, AuditEvent } from "./types.js";

export const GENESIS_PREV_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacHex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export interface AuditAppendInput {
  event: AuditEvent;
  userId: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  list(filter?: { userId?: string }): Promise<AuditEntry[]>;
  tail(): Promise<AuditEntry | null>;
}

export class InMemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  async list(filter?: { userId?: string }): Promise<AuditEntry[]> {
    if (!filter?.userId) return [...this.entries];
    return this.entries.filter((e) => e.userId === filter.userId);
  }
  async tail(): Promise<AuditEntry | null> {
    return this.entries[this.entries.length - 1] ?? null;
  }
}

export class AuditLog {
  private appendQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: AuditStore,
    private readonly secret: string,
  ) {
    if (!secret || secret.length < 32) {
      throw new Error("AuditLog secret must be at least 32 characters");
    }
  }

  append(input: AuditAppendInput): Promise<AuditEntry> {
    const next = this.appendQueue.then(() => this.appendUnsafe(input));
    this.appendQueue = next.catch(() => {});
    return next;
  }

  private async appendUnsafe(input: AuditAppendInput): Promise<AuditEntry> {
    const tail = await this.store.tail();
    const prevHash = tail?.entryHash ?? GENESIS_PREV_HASH;
    const index = (tail?.index ?? -1) + 1;
    const timestamp = input.timestamp ?? new Date().toISOString();
    const payloadCanon = canonicalize(input.payload);
    const payloadHash = sha256Hex(payloadCanon);
    const entryHash = sha256Hex(
      `${prevHash}|${index}|${timestamp}|${input.event}|${input.userId}|${payloadHash}`,
    );
    const signature = hmacHex(this.secret, entryHash);
    const entry: AuditEntry = {
      index,
      timestamp,
      event: input.event,
      userId: input.userId,
      prevHash,
      payload: input.payload,
      payloadHash,
      entryHash,
      signature,
    };
    await this.store.append(entry);
    return entry;
  }

  async list(filter?: { userId?: string }): Promise<AuditEntry[]> {
    return this.store.list(filter);
  }

  verify(entries: AuditEntry[]): { valid: boolean; brokenAt?: number; reason?: string } {
    let expectedPrev = GENESIS_PREV_HASH;
    let expectedIndex = entries.length > 0 ? entries[0].index : 0;
    for (const e of entries) {
      if (e.index !== expectedIndex) {
        return { valid: false, brokenAt: e.index, reason: "index_gap" };
      }
      if (e.prevHash !== expectedPrev && e.index !== 0) {
        return { valid: false, brokenAt: e.index, reason: "prev_hash_mismatch" };
      }
      const payloadHash = sha256Hex(canonicalize(e.payload));
      if (payloadHash !== e.payloadHash) {
        return { valid: false, brokenAt: e.index, reason: "payload_tampered" };
      }
      const entryHash = sha256Hex(
        `${e.prevHash}|${e.index}|${e.timestamp}|${e.event}|${e.userId}|${e.payloadHash}`,
      );
      if (entryHash !== e.entryHash) {
        return { valid: false, brokenAt: e.index, reason: "entry_hash_mismatch" };
      }
      const expectedSig = hmacHex(this.secret, entryHash);
      const a = Buffer.from(expectedSig, "hex");
      const b = Buffer.from(e.signature, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { valid: false, brokenAt: e.index, reason: "signature_invalid" };
      }
      expectedPrev = e.entryHash;
      expectedIndex += 1;
    }
    return { valid: true };
  }

  signReceipt(payload: Record<string, unknown>): string {
    const canon = canonicalize(payload);
    const sig = hmacHex(this.secret, canon);
    const envelope = { payload, signature: sig, algorithm: "HMAC-SHA256" as const };
    return Buffer.from(JSON.stringify(envelope)).toString("base64");
  }

  verifyReceipt(receipt: string): { valid: boolean; payload?: Record<string, unknown> } {
    try {
      const json = Buffer.from(receipt, "base64").toString("utf8");
      const env = JSON.parse(json) as { payload: Record<string, unknown>; signature: string };
      const canon = canonicalize(env.payload);
      const expected = hmacHex(this.secret, canon);
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(env.signature, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
      return { valid: true, payload: env.payload };
    } catch {
      return { valid: false };
    }
  }
}
