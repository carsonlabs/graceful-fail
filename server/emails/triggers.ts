// ── Email Triggers ──────────────────────────────────────────────────────────
// Each trigger checks conditions and sends the appropriate email.
// All triggers are idempotent — safe to call multiple times.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { apiKeys, requestLogs, users } from "../../drizzle/schema";
import { sendEmail } from "./sender";
import { welcomeEmail, inactivityNudgeEmail, usageAlertEmail } from "./templates";

// ── In-memory dedup ─────────────────────────────────────────────────────────
// Simple Map-based guard to prevent duplicate sends within a process lifetime.
// Keys are "{emailType}:{identifier}" and values are the send timestamp.
// This is intentionally ephemeral — a process restart allows re-sending,
// which is acceptable for these low-frequency lifecycle emails.

const sent = new Map<string, number>();

function alreadySent(key: string): boolean {
  return sent.has(key);
}

function markSent(key: string): void {
  sent.set(key, Date.now());
}

// ── Trigger A: Welcome Email ────────────────────────────────────────────────

export async function triggerWelcomeEmail(user: {
  email?: string | null;
  name?: string | null;
}): Promise<boolean> {
  if (!user.email) {
    console.log("[Email:Welcome] No email address — skipping");
    return false;
  }

  const key = `welcome:${user.email}`;
  if (alreadySent(key)) {
    console.log(`[Email:Welcome] Already sent to ${user.email} — skipping`);
    return false;
  }

  const template = welcomeEmail({ name: user.name });
  const ok = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (ok) markSent(key);
  return ok;
}

// ── Trigger B: Inactivity Nudge (48h) ──────────────────────────────────────

export async function triggerInactivityNudge(userId: number): Promise<boolean> {
  const key = `inactivity:${userId}`;
  if (alreadySent(key)) {
    console.log(`[Email:Inactivity] Already sent to user ${userId} — skipping`);
    return false;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Email:Inactivity] Database unavailable — skipping");
    return false;
  }

  // Get user info
  const userRows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user?.email) {
    console.log(`[Email:Inactivity] User ${userId} has no email — skipping`);
    return false;
  }

  // Check if user has at least one API key created > 48h ago
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const keyRows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.isActive, true),
        sql`${apiKeys.createdAt} < ${cutoff48h}`
      )
    )
    .limit(1);

  if (keyRows.length === 0) {
    console.log(`[Email:Inactivity] User ${userId} has no API keys older than 48h — skipping`);
    return false;
  }

  // Check if user has made ANY requests
  const logRows = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .where(eq(requestLogs.userId, userId))
    .limit(1);

  if (logRows.length > 0) {
    console.log(`[Email:Inactivity] User ${userId} has made requests — skipping`);
    return false;
  }

  const template = inactivityNudgeEmail({ name: user.name });
  const ok = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (ok) markSent(key);
  return ok;
}

// ── Trigger C: Usage Alert (80%) ────────────────────────────────────────────

export async function triggerUsageAlert(
  userId: number,
  used: number,
  limit: number,
  tier: string
): Promise<boolean> {
  // Only trigger at 80%+
  if (limit <= 0 || used / limit < 0.8) {
    return false;
  }

  // Dedup by user + month (one alert per billing cycle)
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `usage-alert:${userId}:${month}`;
  if (alreadySent(key)) {
    console.log(`[Email:Usage] Already sent to user ${userId} for ${month} — skipping`);
    return false;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Email:Usage] Database unavailable — skipping");
    return false;
  }

  const userRows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user?.email) {
    console.log(`[Email:Usage] User ${userId} has no email — skipping`);
    return false;
  }

  const upgradeUrl = `https://selfheal.dev/dashboard/billing`;
  const template = usageAlertEmail({
    name: user.name,
    used,
    limit,
    tier,
    upgradeUrl,
  });

  const ok = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (ok) markSent(key);
  return ok;
}
