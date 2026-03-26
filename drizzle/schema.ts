import {
  bigint,
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// --- Graceful Fail specific tables ---

export const TIERS = ["hobby", "pro", "agency"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LIMITS: Record<Tier, number> = {
  hobby: 500,
  pro: 10000,
  agency: 50000,
};

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  /** Prefix shown to user for identification (first 8 chars of raw key) */
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  /** SHA-256 hash of the full key — never store plaintext */
  keyHash: varchar("keyHash", { length: 64 }).notNull().unique(),
  tier: mysqlEnum("tier", ["hobby", "pro", "agency"]).default("hobby").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

export const requestLogs = mysqlTable("request_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  apiKeyId: int("apiKeyId").notNull(),
  userId: int("userId").notNull(),
  destinationUrl: text("destinationUrl").notNull(),
  method: varchar("method", { length: 16 }).notNull(),
  /** HTTP status code returned by the destination API */
  statusCode: int("statusCode").notNull(),
  /** true if the request was intercepted (4xx/5xx) and LLM was invoked */
  wasIntercepted: boolean("wasIntercepted").default(false).notNull(),
  /** Credits consumed (1 per intercepted request, 0 for pass-through) */
  creditsUsed: int("creditsUsed").default(0).notNull(),
  /** Duration of the full proxy round-trip in milliseconds */
  durationMs: int("durationMs").default(0).notNull(),
  /** Short LLM-generated summary of the error (null for pass-through) */
  errorSummary: text("errorSummary"),
  /** Whether the error was deemed retriable by the LLM */
  isRetriable: boolean("isRetriable"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RequestLog = typeof requestLogs.$inferSelect;
export type InsertRequestLog = typeof requestLogs.$inferInsert;

export const usageStats = mysqlTable("usage_stats", {
  id: int("id").autoincrement().primaryKey(),
  apiKeyId: int("apiKeyId").notNull(),
  userId: int("userId").notNull(),
  /** YYYY-MM format e.g. "2026-03" */
  month: varchar("month", { length: 7 }).notNull(),
  totalRequests: int("totalRequests").default(0).notNull(),
  interceptedRequests: int("interceptedRequests").default(0).notNull(),
  creditsUsed: int("creditsUsed").default(0).notNull(),
});

export type UsageStat = typeof usageStats.$inferSelect;
export type InsertUsageStat = typeof usageStats.$inferInsert;

// --- Stripe Subscriptions ---

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  /** The tier this subscription grants */
  tier: mysqlEnum("tier", ["hobby", "pro", "agency"]).default("hobby").notNull(),
  /** active | canceled | past_due | trialing */
  status: varchar("status", { length: 32 }).default("active").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// --- Webhook Endpoints ---

export const webhookEndpoints = mysqlTable("webhook_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: text("url").notNull(),
  /** HMAC-SHA256 signing secret shown once to user */
  secret: varchar("secret", { length: 64 }).notNull(),
  /** JSON array of event types: ["rate_limit", "non_retriable_error", "all"] */
  events: text("events").notNull().default('["all"]'),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  endpointId: int("endpointId").notNull(),
  /** Event type e.g. "rate_limit" | "non_retriable_error" */
  event: varchar("event", { length: 64 }).notNull(),
  /** JSON payload sent */
  payload: text("payload").notNull(),
  /** HTTP status code from the endpoint (null if not delivered) */
  responseStatusCode: int("responseStatusCode"),
  /** Number of delivery attempts made */
  attempts: int("attempts").default(0).notNull(),
  /** Whether delivery ultimately succeeded */
  success: boolean("success").default(false).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;
