import type {
  Adapter,
  AdapterResult,
  CascadeResult,
  CascadeStatus,
  EraseInput,
} from "./types.js";
import { AuditLog } from "./audit.js";

export interface CascadeOptions {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULTS: Required<CascadeOptions> = {
  retries: 1,
  retryDelayMs: 250,
  timeoutMs: 30_000,
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class CascadeEngine {
  private readonly opts: Required<CascadeOptions>;

  constructor(
    private readonly adapters: Adapter[],
    private readonly audit: AuditLog,
    options: CascadeOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    const seen = new Set<string>();
    for (const a of adapters) {
      if (seen.has(a.name)) throw new Error(`Duplicate adapter name: ${a.name}`);
      seen.add(a.name);
    }
  }

  private async runAdapter(adapter: Adapter, input: EraseInput): Promise<AdapterResult> {
    const startedAt = new Date().toISOString();
    let lastError: string | undefined;
    let attempt = 0;
    const maxAttempts = this.opts.retries + 1;

    await this.audit.append({
      event: "adapter.started",
      userId: input.userId,
      payload: { adapter: adapter.name },
    });

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const partial = await withTimeout(
          adapter.erase(input),
          this.opts.timeoutMs,
          `adapter:${adapter.name}`,
        );
        const finishedAt = new Date().toISOString();
        const result: AdapterResult = {
          adapter: adapter.name,
          status: partial.status,
          recordsAffected: partial.recordsAffected,
          error: partial.error,
          details: partial.details,
          startedAt,
          finishedAt,
          attempts: attempt,
        };
        await this.audit.append({
          event: result.status === "failed" ? "adapter.failed" : "adapter.succeeded",
          userId: input.userId,
          payload: {
            adapter: adapter.name,
            status: result.status,
            recordsAffected: result.recordsAffected,
            attempts: attempt,
            error: result.error,
          },
        });
        if (result.status !== "failed") return result;
        lastError = result.error ?? "adapter returned failed";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await this.audit.append({
          event: "adapter.failed",
          userId: input.userId,
          payload: { adapter: adapter.name, attempt, error: lastError },
        });
      }
      if (attempt < maxAttempts) {
        await this.audit.append({
          event: "adapter.retrying",
          userId: input.userId,
          payload: { adapter: adapter.name, nextAttempt: attempt + 1 },
        });
        await sleep(this.opts.retryDelayMs);
      }
    }

    const finishedAt = new Date().toISOString();
    return {
      adapter: adapter.name,
      status: "failed",
      recordsAffected: 0,
      startedAt,
      finishedAt,
      attempts: attempt,
      error: lastError ?? "unknown error",
    };
  }

  async erase(input: EraseInput): Promise<CascadeResult> {
    const startedAt = new Date().toISOString();
    await this.audit.append({
      event: "cascade.started",
      userId: input.userId,
      payload: {
        adapters: this.adapters.map((a) => a.name),
        reason: input.reason,
        requestedBy: input.requestedBy,
      },
    });

    const settled = await Promise.allSettled(
      this.adapters.map((a) => this.runAdapter(a, input)),
    );

    const results: AdapterResult[] = settled.map((s, i) => {
      if (s.status === "fulfilled") return s.value;
      return {
        adapter: this.adapters[i].name,
        status: "failed",
        recordsAffected: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
        attempts: 0,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      };
    });

    const status = aggregateStatus(results);
    const completedAt = new Date().toISOString();
    const completionEntry = await this.audit.append({
      event: "cascade.completed",
      userId: input.userId,
      payload: {
        status,
        adapterResults: results.map((r) => ({
          adapter: r.adapter,
          status: r.status,
          recordsAffected: r.recordsAffected,
          attempts: r.attempts,
          error: r.error,
        })),
      },
    });

    return {
      userId: input.userId,
      status,
      startedAt,
      completedAt,
      reason: input.reason,
      requestedBy: input.requestedBy,
      adapterResults: results,
      auditRootHash: completionEntry.entryHash,
    };
  }
}

function aggregateStatus(results: AdapterResult[]): CascadeStatus {
  if (results.length === 0) return "success";
  const failed = results.filter((r) => r.status === "failed").length;
  if (failed === 0 && results.every((r) => r.status === "success")) return "success";
  if (failed === results.length) return "failed";
  return "partial";
}
