/**
 * Rate limiter — Upstash Redis if configured, in-memory fallback otherwise.
 *
 * Fixed window: `limit` requests per `windowMs`, keyed by any string.
 *
 * Without Upstash, buckets live in one process's memory. Railway restarts
 * and multi-dyno fan-out both reset them, so set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN in production.
 *
 * Zero deps — uses fetch against Upstash's REST API.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

async function upstashCmd(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const redisKey = `rl:${key}`;
      const count = Number(await upstashCmd(["INCR", redisKey]));
      if (count === 1) {
        await upstashCmd(["PEXPIRE", redisKey, windowMs]);
      }
      const ttl = Number(await upstashCmd(["PTTL", redisKey]));
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt: now + (ttl > 0 ? ttl : windowMs),
      };
    } catch (err) {
      console.warn("[rate-limit] Upstash failed, falling back to in-memory:", err);
    }
  }

  return memRateLimit(key, limit, windowMs, now);
}

function memRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const entry = memoryBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, limit, resetAt };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, limit, resetAt: entry.resetAt };
  }
  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    limit,
    resetAt: entry.resetAt,
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryBuckets) {
    if (now > entry.resetAt) memoryBuckets.delete(key);
  }
}, 10 * 60 * 1000);
cleanup.unref?.();
