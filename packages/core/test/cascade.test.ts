import { describe, it, expect } from "vitest";
import { CascadeEngine } from "../src/cascade.js";
import { AuditLog, InMemoryAuditStore } from "../src/audit.js";
import type { Adapter, EraseInput } from "../src/types.js";

const SECRET = "a".repeat(32);

function makeAudit() {
  return new AuditLog(new InMemoryAuditStore(), SECRET);
}

class StubAdapter implements Adapter {
  attempts = 0;
  constructor(
    public readonly name: string,
    private readonly behavior: (attempt: number, input: EraseInput) => Promise<{ status: "success" | "failed"; recordsAffected: number; error?: string }>,
  ) {}
  async erase(input: EraseInput) {
    this.attempts += 1;
    return this.behavior(this.attempts, input);
  }
}

describe("CascadeEngine", () => {
  it("runs all adapters in parallel and aggregates success", async () => {
    const audit = makeAudit();
    const a = new StubAdapter("a", async () => ({ status: "success", recordsAffected: 2 }));
    const b = new StubAdapter("b", async () => ({ status: "success", recordsAffected: 5 }));
    const engine = new CascadeEngine([a, b], audit, { retryDelayMs: 1 });

    const result = await engine.erase({ userId: "u1" });
    expect(result.status).toBe("success");
    expect(result.adapterResults).toHaveLength(2);
    expect(result.adapterResults.every((r) => r.status === "success")).toBe(true);
    expect(result.auditRootHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("retries a failing adapter once and succeeds on second attempt", async () => {
    const audit = makeAudit();
    const flaky = new StubAdapter("flaky", async (attempt) => {
      if (attempt === 1) throw new Error("transient");
      return { status: "success", recordsAffected: 1 };
    });
    const engine = new CascadeEngine([flaky], audit, { retries: 1, retryDelayMs: 1 });
    const result = await engine.erase({ userId: "u2" });
    expect(result.status).toBe("success");
    expect(result.adapterResults[0].attempts).toBe(2);
    expect(flaky.attempts).toBe(2);
  });

  it("marks adapter failed after retries exhausted but continues other adapters (partial)", async () => {
    const audit = makeAudit();
    const broken = new StubAdapter("broken", async () => {
      throw new Error("dead");
    });
    const ok = new StubAdapter("ok", async () => ({ status: "success", recordsAffected: 4 }));
    const engine = new CascadeEngine([broken, ok], audit, { retries: 1, retryDelayMs: 1 });
    const result = await engine.erase({ userId: "u3" });
    expect(result.status).toBe("partial");
    expect(broken.attempts).toBe(2);
    const brokenResult = result.adapterResults.find((r) => r.adapter === "broken")!;
    expect(brokenResult.status).toBe("failed");
    expect(brokenResult.attempts).toBe(2);
    expect(brokenResult.error).toContain("dead");
    const okResult = result.adapterResults.find((r) => r.adapter === "ok")!;
    expect(okResult.status).toBe("success");
  });

  it("reports failed when all adapters fail", async () => {
    const audit = makeAudit();
    const a = new StubAdapter("a", async () => { throw new Error("x"); });
    const b = new StubAdapter("b", async () => { throw new Error("y"); });
    const engine = new CascadeEngine([a, b], audit, { retries: 0, retryDelayMs: 1 });
    const result = await engine.erase({ userId: "u4" });
    expect(result.status).toBe("failed");
    expect(result.adapterResults.every((r) => r.status === "failed")).toBe(true);
  });

  it("rejects duplicate adapter names", () => {
    const audit = makeAudit();
    const a1 = new StubAdapter("dup", async () => ({ status: "success", recordsAffected: 0 }));
    const a2 = new StubAdapter("dup", async () => ({ status: "success", recordsAffected: 0 }));
    expect(() => new CascadeEngine([a1, a2], audit)).toThrow(/Duplicate adapter/);
  });

  it("times out a slow adapter", async () => {
    const audit = makeAudit();
    const slow = new StubAdapter("slow", () => new Promise(() => {}));
    const engine = new CascadeEngine([slow], audit, { retries: 0, timeoutMs: 50, retryDelayMs: 1 });
    const result = await engine.erase({ userId: "u5" });
    expect(result.status).toBe("failed");
    expect(result.adapterResults[0].error).toMatch(/timed out/);
  });

  it("audit log captures cascade.started → adapter events → cascade.completed", async () => {
    const audit = makeAudit();
    const a = new StubAdapter("a", async () => ({ status: "success", recordsAffected: 1 }));
    const engine = new CascadeEngine([a], audit, { retryDelayMs: 1 });
    await engine.erase({ userId: "u6", reason: "gdpr_article_17", requestedBy: "jane@example.com" });
    const entries = await audit.list({ userId: "u6" });
    const events = entries.map((e) => e.event);
    expect(events[0]).toBe("cascade.started");
    expect(events).toContain("adapter.started");
    expect(events).toContain("adapter.succeeded");
    expect(events[events.length - 1]).toBe("cascade.completed");
    expect(audit.verify(entries).valid).toBe(true);
  });
});
