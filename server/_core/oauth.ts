import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

export function registerOAuthRoutes(app: Express) {
  // Redirect to GitHub login
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const redirectUri = (req.query.redirect as string) || "/";
    const loginUrl = sdk.getLoginUrl(redirectUri);
    res.redirect(302, loginUrl);
  });

  // GitHub OAuth callback
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    try {
      // Exchange code for GitHub access token
      const accessToken = await sdk.exchangeCodeForToken(code);

      // Get user info from GitHub
      const userInfo = await sdk.getGitHubUser(accessToken);

      // Upsert user in database
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name,
        email: userInfo.email,
        loginMethod: userInfo.loginMethod,
        lastSignedIn: new Date(),
      });

      // Create session JWT
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie and redirect
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Decode redirect from state
      const redirectTo = state ? Buffer.from(state, "base64").toString("utf-8") : "/";
      res.redirect(302, redirectTo);
    } catch (error) {
      console.error("[OAuth] GitHub callback failed:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Logout
  app.post("/api/oauth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ success: true });
  });
}
