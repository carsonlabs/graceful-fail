import { eq, and, count, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getDb } from "./db";
import { referrals, bonusCredits, users } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const BONUS_CREDITS = 100;

async function getOrCreateReferralCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Check if user already has a code
  const existing = await db
    .select({ code: referrals.code })
    .from(referrals)
    .where(eq(referrals.referrerId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].code;

  // Generate a unique 8-char alphanumeric code
  let code: string;
  let attempts = 0;
  do {
    code = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    const conflict = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.code, code))
      .limit(1);
    if (conflict.length === 0) break;
    attempts++;
  } while (attempts < 10);

  await db.insert(referrals).values({
    referrerId: userId,
    code: code!,
  });

  return code!;
}

export const referralRouter = router({
  /** Get (or lazily create) the current user's referral code */
  getCode: protectedProcedure.query(async ({ ctx }) => {
    try {
      const code = await getOrCreateReferralCode(ctx.user.id);
      return { code };
    } catch {
      return { code: null };
    }
  }),

  /** Get referral stats for the current user */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalReferrals: 0, pendingReferrals: 0, bonusCreditsEarned: 0, bonusCreditsPending: 0 };

    const [refRows, creditRows] = await Promise.all([
      db
        .select({
          total: sql<number>`COUNT(*)`,
          redeemed: sql<number>`SUM(CASE WHEN referredUserId IS NOT NULL THEN 1 ELSE 0 END)`,
          bonusAwarded: sql<number>`SUM(CASE WHEN bonusAwarded = 1 THEN 1 ELSE 0 END)`,
        })
        .from(referrals)
        .where(eq(referrals.referrerId, ctx.user.id)),
      db
        .select({ total: sql<number>`COALESCE(SUM(credits), 0)` })
        .from(bonusCredits)
        .where(eq(bonusCredits.userId, ctx.user.id)),
    ]);

    const ref = refRows[0] ?? { total: 0, redeemed: 0, bonusAwarded: 0 };
    const totalReferrals = Number(ref.total);
    const redeemedReferrals = Number(ref.redeemed);
    const awardedReferrals = Number(ref.bonusAwarded);
    const bonusCreditsEarned = Number(creditRows[0]?.total ?? 0);
    const bonusCreditsPending = (redeemedReferrals - awardedReferrals) * BONUS_CREDITS;

    return {
      totalReferrals,
      redeemedReferrals,
      bonusCreditsEarned,
      bonusCreditsPending: Math.max(0, bonusCreditsPending),
    };
  }),

  /** Called on signup — redeem a referral code and award bonus credits to both parties */
  redeem: publicProcedure
    .input(z.object({ code: z.string().min(1).max(16), newUserId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, reason: "db_unavailable" };

      // Find the referral record (must be unclaimed)
      const rows = await db
        .select()
        .from(referrals)
        .where(and(eq(referrals.code, input.code.toUpperCase())))
        .limit(1);

      if (rows.length === 0) return { success: false, reason: "invalid_code" };
      const ref = rows[0];

      // Prevent self-referral
      if (ref.referrerId === input.newUserId) return { success: false, reason: "self_referral" };

      // Prevent double-redemption
      if (ref.referredUserId !== null) return { success: false, reason: "already_redeemed" };

      // Mark referral as redeemed
      await db
        .update(referrals)
        .set({ referredUserId: input.newUserId, bonusAwarded: true, redeemedAt: new Date() })
        .where(eq(referrals.id, ref.id));

      // Award bonus credits to both referrer and referee
      await db.insert(bonusCredits).values([
        { userId: ref.referrerId, credits: BONUS_CREDITS, reason: "referral_referrer" },
        { userId: input.newUserId, credits: BONUS_CREDITS, reason: "referral_referee" },
      ]);

      return { success: true };
    }),

  /** Get total bonus credits balance for the current user */
  getBonusBalance: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { balance: 0 };
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(credits), 0)` })
      .from(bonusCredits)
      .where(eq(bonusCredits.userId, ctx.user.id));
    return { balance: Number(rows[0]?.total ?? 0) };
  }),
});
