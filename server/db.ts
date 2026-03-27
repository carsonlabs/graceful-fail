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
  webhookEndpoints,
  slackIntegrations,
  InsertSlackIntegration,
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

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function getOnboardingStatus(userId: number) {
  const db = await getDb();
  if (!db) return { hasApiKey: false, hasMadeRequest: false, hasWebhook: false, isDismissed: false };

  const [keyRows, logRows, webhookRows, userRows] = await Promise.all([
    db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true))).limit(1),
    db.select({ id: requestLogs.id }).from(requestLogs).where(eq(requestLogs.userId, userId)).limit(1),
    db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.userId, userId), eq(webhookEndpoints.isActive, true))).limit(1),
    db.select({ onboardingDismissed: users.onboardingDismissed }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  return {
    hasApiKey: keyRows.length > 0,
    hasMadeRequest: logRows.length > 0,
    hasWebhook: webhookRows.length > 0,
    isDismissed: userRows[0]?.onboardingDismissed ?? false,
  };
}

export async function dismissOnboarding(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ onboardingDismissed: true }).where(eq(users.id, userId));
}

export async function getAllRequestLogsForUser(userId: number, interceptedOnly: boolean) {
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
    .limit(10000);
}

// ── Slack Integration ─────────────────────────────────────────────────────────

export async function getSlackIntegration(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(slackIntegrations)
    .where(eq(slackIntegrations.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertSlackIntegration(
  userId: number,
  data: { webhookUrl: string; channel?: string | null; enabled: boolean }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(slackIntegrations)
    .values({ userId, webhookUrl: data.webhookUrl, channel: data.channel ?? null, enabled: data.enabled })
    .onDuplicateKeyUpdate({
      set: { webhookUrl: data.webhookUrl, channel: data.channel ?? null, enabled: data.enabled },
    });
}

export async function deleteSlackIntegration(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(slackIntegrations).where(eq(slackIntegrations.userId, userId));
}

// ── Public API Leaderboard ────────────────────────────────────────────────────

export async function getApiLeaderboard() {
  const db = await getDb();
  if (!db) return [];
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Aggregate failed requests by destination domain (anonymized — no paths/params)
  const rows = await db
    .select({
      destinationUrl: requestLogs.destinationUrl,
      errorCategory: requestLogs.errorCategory,
      count: sql<number>`COUNT(*)`,
    })
    .from(requestLogs)
    .where(
      sql`wasIntercepted = 1 AND createdAt >= ${since24h}`
    )
    .groupBy(requestLogs.destinationUrl, requestLogs.errorCategory)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(200); // Fetch more, then aggregate by domain in JS

  // Extract hostname and aggregate
  const domainMap = new Map<string, { failureCount: number; topCategory: string; categoryCount: Map<string, number> }>();
  for (const row of rows) {
    let hostname = "unknown";
    try {
      hostname = new URL(row.destinationUrl).hostname.replace(/^www\./, "");
    } catch { /* skip malformed */ }

    const existing = domainMap.get(hostname);
    const cat = row.errorCategory ?? "unknown";
    const cnt = Number(row.count);

    if (existing) {
      existing.failureCount += cnt;
      existing.categoryCount.set(cat, (existing.categoryCount.get(cat) ?? 0) + cnt);
    } else {
      const categoryCount = new Map<string, number>();
      categoryCount.set(cat, cnt);
      domainMap.set(hostname, { failureCount: cnt, topCategory: cat, categoryCount });
    }
  }

  // Resolve top category per domain and sort
  const result = Array.from(domainMap.entries())
    .map(([domain, data]) => {
      let topCategory = "unknown";
      let topCount = 0;
      for (const [cat, cnt] of Array.from(data.categoryCount.entries())) {
        if (cnt > topCount) { topCount = cnt; topCategory = cat; }
      }
      return { domain, failureCount: data.failureCount, topCategory };
    })
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 10);

  return result;
}

// ── Weekly Digest ─────────────────────────────────────────────────────────────

export async function getWeeklyDigestData(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [statsRows, topApiRows, userRows] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)`,
        intercepted: sql<number>`SUM(CASE WHEN wasIntercepted = 1 THEN 1 ELSE 0 END)`,
        credits: sql<number>`SUM(creditsUsed)`,
      })
      .from(requestLogs)
      .where(sql`userId = ${userId} AND createdAt >= ${since7d}`),
    db
      .select({
        destinationUrl: requestLogs.destinationUrl,
        count: sql<number>`COUNT(*)`,
      })
      .from(requestLogs)
      .where(sql`userId = ${userId} AND wasIntercepted = 1 AND createdAt >= ${since7d}`)
      .groupBy(requestLogs.destinationUrl)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    db.select({ name: users.name, email: users.email, weeklyDigestEnabled: users.weeklyDigestEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  const user = userRows[0];
  if (!user?.weeklyDigestEnabled) return null;

  const stats = statsRows[0];
  const total = Number(stats?.total ?? 0);
  const intercepted = Number(stats?.intercepted ?? 0);
  const credits = Number(stats?.credits ?? 0);

  // Aggregate top failing APIs by domain
  const domainMap = new Map<string, number>();
  for (const row of topApiRows) {
    let hostname = "unknown";
    try { hostname = new URL(row.destinationUrl).hostname.replace(/^www\./, ""); } catch { /* skip */ }
    domainMap.set(hostname, (domainMap.get(hostname) ?? 0) + Number(row.count));
  }
  const topApis = Array.from(domainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain, count]) => ({ domain, count }));

  return {
    userName: user.name ?? "Developer",
    userEmail: user.email,
    totalRequests: total,
    interceptedRequests: intercepted,
    creditsUsed: credits,
    successRate: total > 0 ? Math.round(((total - intercepted) / total) * 100) : 100,
    topFailingApis: topApis,
  };
}

export async function getUsersForDigest() {
  const db = await getDb();
  if (!db) return [];
  // Get users who have digest enabled and either never received one or last received >6 days ago
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const result = await db
    .select({ id: users.id, name: users.name, email: users.email, lastDigestSentAt: users.lastDigestSentAt })
    .from(users)
    .where(
      sql`weeklyDigestEnabled = 1 AND (lastDigestSentAt IS NULL OR lastDigestSentAt < ${sixDaysAgo})`
    );
  return result;
}

export async function markDigestSent(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastDigestSentAt: new Date() }).where(eq(users.id, userId));
}

export async function setWeeklyDigestEnabled(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ weeklyDigestEnabled: enabled }).where(eq(users.id, userId));
}
