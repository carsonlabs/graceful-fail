/**
 * Schema cache — caches compiled JSON schemas and normalization results.
 * Short TTL to avoid stale data while reducing redundant LLM calls.
 */

interface SchemaCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SchemaCache {
  private store = new Map<string, SchemaCacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries = 500, defaultTtlMs = 60_000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /** Build a cache key from the schema + response content */
  static buildKey(schema: unknown, responseBody: string): string {
    const schemaStr = typeof schema === "string" ? schema : JSON.stringify(schema);
    // Use first 512 chars of response + schema hash for key
    const bodyKey = responseBody.slice(0, 512);
    return `${schemaStr.slice(0, 256)}:${bodyKey}`;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}
