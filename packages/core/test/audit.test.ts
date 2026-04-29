import { describe, it, expect } from "vitest";
import { AuditLog, InMemoryAuditStore, GENESIS_PREV_HASH } from "../src/audit.js";

const SECRET = "a".repeat(32);

describe("AuditLog", () => {
  it("requires a secret of at least 32 chars", () => {
    expect(() => new AuditLog(new InMemoryAuditStore(), "short")).toThrow();
  });

  it("appends entries that form a hash chain anchored at genesis", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    const a = await log.append({ event: "cascade.started", userId: "u1", payload: { x: 1 } });
    const b = await log.append({ event: "adapter.started", userId: "u1", payload: { adapter: "pg" } });
    const c = await log.append({ event: "cascade.completed", userId: "u1", payload: { status: "success" } });

    expect(a.index).toBe(0);
    expect(a.prevHash).toBe(GENESIS_PREV_HASH);
    expect(b.prevHash).toBe(a.entryHash);
    expect(c.prevHash).toBe(b.entryHash);
    expect(a.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies an untampered chain", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    await log.append({ event: "cascade.started", userId: "u1", payload: { a: 1 } });
    await log.append({ event: "adapter.succeeded", userId: "u1", payload: { adapter: "pg", recordsAffected: 3 } });
    await log.append({ event: "cascade.completed", userId: "u1", payload: { status: "success" } });
    const entries = await log.list();
    expect(log.verify(entries)).toEqual({ valid: true });
  });

  it("detects payload tampering", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    await log.append({ event: "cascade.started", userId: "u1", payload: { a: 1 } });
    const e2 = await log.append({ event: "adapter.succeeded", userId: "u1", payload: { adapter: "pg", recordsAffected: 3 } });
    await log.append({ event: "cascade.completed", userId: "u1", payload: { status: "success" } });
    const entries = await log.list();
    const tampered = entries.map((e) =>
      e.index === e2.index ? { ...e, payload: { adapter: "pg", recordsAffected: 99999 } } : e,
    );
    const result = log.verify(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(e2.index);
    expect(result.reason).toBe("payload_tampered");
  });

  it("detects signature forgery from a different secret", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    const e = await log.append({ event: "cascade.started", userId: "u1", payload: {} });
    const attacker = new AuditLog(new InMemoryAuditStore(), "z".repeat(32));
    const forged = { ...e, signature: "f".repeat(64) };
    const result = attacker.verify([forged]);
    expect(result.valid).toBe(false);
  });

  it("detects a removed entry (chain break)", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    await log.append({ event: "cascade.started", userId: "u1", payload: {} });
    await log.append({ event: "adapter.succeeded", userId: "u1", payload: { adapter: "pg" } });
    await log.append({ event: "cascade.completed", userId: "u1", payload: { status: "success" } });
    const all = await log.list();
    const truncated = [all[0], all[2]];
    const result = log.verify(truncated);
    expect(result.valid).toBe(false);
  });

  it("signs and verifies a receipt", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    const receipt = log.signReceipt({ userId: "u1", status: "success", rootHash: "abc" });
    const v = log.verifyReceipt(receipt);
    expect(v.valid).toBe(true);
    expect(v.payload?.userId).toBe("u1");
  });

  it("hashes payloads using JSON-canonical form (undefined keys dropped, key order independent)", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    const a = await log.append({ event: "adapter.succeeded", userId: "u", payload: { adapter: "pg", recordsAffected: 3, error: undefined } });
    const b = await log.append({ event: "adapter.succeeded", userId: "u", payload: { recordsAffected: 3, adapter: "pg" } });
    expect(a.payloadHash).toBe(b.payloadHash);
  });

  it("rejects a tampered receipt", async () => {
    const log = new AuditLog(new InMemoryAuditStore(), SECRET);
    const receipt = log.signReceipt({ userId: "u1", status: "success" });
    const decoded = JSON.parse(Buffer.from(receipt, "base64").toString("utf8"));
    decoded.payload.status = "failed";
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64");
    expect(log.verifyReceipt(tampered).valid).toBe(false);
  });
});
