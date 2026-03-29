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
  onboardingDismissed: boolean("onboardingDismissed").default(false).notNull(),
  /** Whether the user has opted in to weekly digest emails */
  weeklyDigestEnabled: boolean("weeklyDigestEnabled").default(true).notNull(),
  /** Timestamp of last digest sent (for scheduling) */
  lastDigestSentAt: timestamp("lastDigestSentAt"),
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

export const API_PROVIDERS = ["openai", "anthropic", "google", "cohere", "mistral", "huggingface", "azure_openai", "other"] as const;
export type ApiProvider = (typeof API_PROVIDERS)[number];

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
  /** Detected AI provider (openai, anthropic, etc.) — null for non-AI APIs */
  provider: varchar("provider", { length: 32 }),
  /** Error category from LLM analysis */
  errorCategory: varchar("errorCategory", { length: 32 }),
  /** Whether an auto-retry with fixed payload was attempted */
  wasAutoRetried: boolean("wasAutoRetried").default(false),
  /** Whether the auto-retry returned a 2xx success */
  retrySucceeded: boolean("retrySucceeded"),
  /** HTTP status code of the retry attempt (null if not retried) */
  retryStatusCode: int("retryStatusCode"),
  /** Source of the error: proxy (default), sentry, or future integrations */
  source: varchar("source", { length: 32 }).default("proxy"),
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

// --- Referrals ---

export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  /** The user who shared the referral link */
  referrerId: int("referrerId").notNull(),
  /** Unique short code embedded in the referral URL */
  code: varchar("code", { length: 16 }).notNull().unique(),
  /** The user who signed up via this code (null until redeemed) */
  referredUserId: int("referredUserId"),
  /** Whether bonus credits have been awarded to both parties */
  bonusAwarded: boolean("bonusAwarded").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  redeemedAt: timestamp("redeemedAt"),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

export const bonusCredits = mysqlTable("bonus_credits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  credits: int("credits").notNull(),
  /** Human-readable reason e.g. "referral_referrer" | "referral_referee" */
  reason: varchar("reason", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BonusCredit = typeof bonusCredits.$inferSelect;
export type InsertBonusCredit = typeof bonusCredits.$inferInsert;

// --- Slack Integration ---

export const slackIntegrations = mysqlTable("slack_integrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Slack Incoming Webhook URL */
  webhookUrl: text("webhookUrl").notNull(),
  /** Optional channel override (e.g. #alerts) */
  channel: varchar("channel", { length: 128 }),
  /** Whether to send alerts for non-retriable errors */
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SlackIntegration = typeof slackIntegrations.$inferSelect;
export type InsertSlackIntegration = typeof slackIntegrations.$inferInsert;

// --- Sentry Integration ---

export const sentryIntegrations = mysqlTable("sentry_integrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** HMAC-SHA256 secret for verifying inbound Sentry webhooks */
  webhookSecret: varchar("webhookSecret", { length: 64 }).notNull(),
  /** Optional Sentry project slug for filtering */
  projectSlug: varchar("projectSlug", { length: 128 }),
  /** Whether to process incoming Sentry events */
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SentryIntegration = typeof sentryIntegrations.$inferSelect;
export type InsertSentryIntegration = typeof sentryIntegrations.$inferInsert;
