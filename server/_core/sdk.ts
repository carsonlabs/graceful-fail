import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

class SDKServer {
  // ── GitHub OAuth ─────────────────────────────────────────────────────────

  getLoginUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: ENV.githubClientId,
      redirect_uri: `${ENV.appUrl}/api/oauth/callback`,
      scope: "read:user user:email",
      state: Buffer.from(redirectUri).toString("base64"),
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: ENV.githubClientId,
        client_secret: ENV.githubClientSecret,
        code,
      }),
    });

    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!data.access_token) {
      throw new Error(data.error || "Failed to exchange code for token");
    }
    return data.access_token;
  }

  async getGitHubUser(accessToken: string): Promise<{
    openId: string;
    name: string | null;
    email: string | null;
    loginMethod: string;
  }> {
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }),
    ]);

    const user = (await userRes.json()) as { id: number; login: string; name: string | null };
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean }>;
    const primaryEmail = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;

    return {
      openId: `github_${user.id}`,
      name: user.name || user.login,
      email: primaryEmail,
      loginMethod: "github",
    };
  }

  // ── Session Management (JWT — unchanged) ─────────────────────────────────

  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(
    openId: string,
    options: { name?: string; expiresInMs?: number } = {}
  ): Promise<string> {
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);

    return new SignJWT({
      openId,
      appId: ENV.appId,
      name: options.name || "",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) return null;

    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        typeof openId !== "string" || !openId ||
        typeof appId !== "string" || !appId ||
        typeof name !== "string"
      ) {
        return null;
      }

      return { openId, appId, name: name || "" };
    } catch {
      return null;
    }
  }

  // ── Request Authentication ───────────────────────────────────────────────

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = req.headers.cookie
      ? new Map(Object.entries(parseCookieHeader(req.headers.cookie)))
      : new Map<string, string>();

    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: new Date(),
    });

    return user;
  }
}

export const sdk = new SDKServer();
