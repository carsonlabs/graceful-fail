import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertApiKey,
  InsertRequestLog,
  InsertUser,
  TIER_LIMITS,
  apiKeys,
  requestLogs,
  usageStats,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ── API Keys ─────────────────────────────────────────────────────────────────

export async function createApiKey(data: InsertApiKey) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(apiKeys).values(data);
  return result;
}

export async function getApiKeysByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function getApiKeyByHash(keyHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);
  return result[0];
}

export async function revokeApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

export async function touchApiKeyLastUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}

// ── Request Logs ──────────────────────────────────────────────────────────────

export async function insertRequestLog(data: InsertRequestLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(requestLogs).values(data);
}

export async function getRequestLogsByUserId(
  userId: number,
  limit = 50,
  offset = 0,
  interceptedOnly = false
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = interceptedOnly
    ? and(eq(requestLogs.userId, userId), eq(requestLogs.wasIntercepted, true))
    : eq(requestLogs.userId, userId);
  return db
    .select()
    .from(requestLogs)
    .where(conditions)
    .orderBy(desc(requestLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getRequestLogCount(userId: number, interceptedOnly = false) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = interceptedOnly
    ? and(eq(requestLogs.userId, userId), eq(requestLogs.wasIntercepted, true))
    : eq(requestLogs.userId, userId);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(requestLogs)
    .where(conditions);
  return result[0]?.count ?? 0;
}

// ── Usage Stats ───────────────────────────────────────────────────────────────

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function upsertUsageStat(
  apiKeyId: number,
  userId: number,
  wasIntercepted: boolean
) {
  const db = await getDb();
  if (!db) return;
  const month = getCurrentMonth();
  const creditsToAdd = wasIntercepted ? 1 : 0;

  await db
    .insert(usageStats)
    .values({
      apiKeyId,
      userId,
      month,
      totalRequests: 1,
      interceptedRequests: wasIntercepted ? 1 : 0,
      creditsUsed: creditsToAdd,
    })
    .onDuplicateKeyUpdate({
      set: {
        totalRequests: sql`totalRequests + 1`,
        interceptedRequests: sql`interceptedRequests + ${wasIntercepted ? 1 : 0}`,
        creditsUsed: sql`creditsUsed + ${creditsToAdd}`,
      },
    });
}

export async function getUsageStatsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(usageStats)
    .where(eq(usageStats.userId, userId))
    .orderBy(desc(usageStats.month));
}

export async function getCurrentMonthUsageForKey(apiKeyId: number) {
  const db = await getDb();
  if (!db) return null;
  const month = getCurrentMonth();
  const result = await db
    .select()
    .from(usageStats)
    .where(and(eq(usageStats.apiKeyId, apiKeyId), eq(usageStats.month, month)))
    .limit(1);
  return result[0] ?? null;
}

export async function checkRateLimit(
  apiKeyId: number,
  tier: keyof typeof TIER_LIMITS
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = TIER_LIMITS[tier];
  const stat = await getCurrentMonthUsageForKey(apiKeyId);
  const used = stat?.totalRequests ?? 0;
  return { allowed: used < limit, used, limit };
}

export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalRequests: 0, interceptedRequests: 0, creditsUsed: 0, successRate: 0 };

  const month = getCurrentMonth();
  const result = await db
    .select({
      totalRequests: sql<number>`COALESCE(SUM(totalRequests), 0)`,
      interceptedRequests: sql<number>`COALESCE(SUM(interceptedRequests), 0)`,
      creditsUsed: sql<number>`COALESCE(SUM(creditsUsed), 0)`,
    })
    .from(usageStats)
    .where(and(eq(usageStats.userId, userId), eq(usageStats.month, month)));

  const row = result[0] ?? { totalRequests: 0, interceptedRequests: 0, creditsUsed: 0 };
  const total = Number(row.totalRequests);
  const intercepted = Number(row.interceptedRequests);
  const successRate = total > 0 ? Math.round(((total - intercepted) / total) * 100) : 100;

  return {
    totalRequests: total,
    interceptedRequests: intercepted,
    creditsUsed: Number(row.creditsUsed),
    successRate,
  };
}

// ── Public Status ─────────────────────────────────────────────────────────────

export async function getPublicStatus() {
  const db = await getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (!db) {
    return {
      status: "degraded" as const,
      totalRequests24h: 0,
      interceptedRequests24h: 0,
      avgProxyLatencyMs: null as number | null,
      avgLlmLatencyMs: null as number | null,
      interceptionRate: 0,
    };
  }

  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      intercepted: sql<number>`SUM(CASE WHEN wasIntercepted = 1 THEN 1 ELSE 0 END)`,
      avgProxy: sql<number>`AVG(durationMs)`,
      avgLlm: sql<number>`AVG(CASE WHEN wasIntercepted = 1 AND llmDurationMs IS NOT NULL THEN llmDurationMs ELSE NULL END)`,
    })
    .from(requestLogs)
    .where(sql`createdAt >= ${since24h}`);

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  const intercepted = Number(row?.intercepted ?? 0);
  const avgProxy = row?.avgProxy != null ? Math.round(Number(row.avgProxy)) : null;
  const avgLlm = row?.avgLlm != null ? Math.round(Number(row.avgLlm)) : null;
  const interceptionRate = total > 0 ? Math.round((intercepted / total) * 100) : 0;

  // Mark degraded if avg proxy latency > 3 seconds
  const status = avgProxy != null && avgProxy > 3000 ? "degraded" as const : "operational" as const;

  return {
    status,
    totalRequests24h: total,
    interceptedRequests24h: intercepted,
    avgProxyLatencyMs: avgProxy,
    avgLlmLatencyMs: avgLlm,
    interceptionRate,
  };
}
