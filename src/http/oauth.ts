import { randomBytes } from "node:crypto";
import { Router, Request, Response } from "express";
import { google } from "googleapis";
import type { Config } from "../config.js";
import { TokenStore, makeOAuth2Client } from "../auth/index.js";
import { AccountService } from "../mcp/index.js";
import { safeEqual } from "./admin.js";

// ---------------------------------------------------------------------------
// OAuth flow — server-managed Google auth.
//
// The OAuth `state` is a single-use random nonce mapped server-side to the
// admin session, so the admin password never travels through Google's
// redirect chain and the callback is CSRF-protected.
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthDeps {
  config: Config;
  store: TokenStore;
  accounts: AccountService;
}

export function oauthRoutes({ config, store, accounts }: OAuthDeps): Router {
  const router = Router();
  const pendingStates = new Map<string, { adminKey: string; expires: number }>();

  function issueState(adminKey: string): string {
    for (const [nonce, entry] of pendingStates) {
      if (entry.expires < Date.now()) pendingStates.delete(nonce);
    }
    const nonce = randomBytes(16).toString("hex");
    pendingStates.set(nonce, { adminKey, expires: Date.now() + STATE_TTL_MS });
    return nonce;
  }

  function consumeState(nonce: string | undefined): string | null {
    if (!nonce) return null;
    const entry = pendingStates.get(nonce);
    if (!entry) return null;
    pendingStates.delete(nonce);
    if (entry.expires < Date.now()) return null;
    return entry.adminKey;
  }

  router.get("/oauth/start", (req: Request, res: Response) => {
    const key = req.query.key as string | undefined;
    if (!key || !safeEqual(key, config.adminPassword)) {
      res.status(401).send("Unauthorized");
      return;
    }

    const oauth2 = makeOAuth2Client(config);
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: config.scopes,
      state: issueState(key),
    });

    res.redirect(url);
  });

  router.get("/oauth/callback", async (req: Request, res: Response) => {
    const adminKey = consumeState(req.query.state as string | undefined);
    if (!adminKey) {
      res
        .status(400)
        .send("OAuth state is invalid or expired. Start again from the /setup page.");
      return;
    }

    const backToSetup = (message: string) =>
      res.redirect(
        `/setup?key=${encodeURIComponent(adminKey)}&message=${encodeURIComponent(message)}`
      );

    const error = req.query.error as string | undefined;
    if (error) {
      backToSetup(`OAuth error: ${error}`);
      return;
    }

    const code = req.query.code as string | undefined;
    if (!code) {
      backToSetup("No authorization code received");
      return;
    }

    try {
      const oauth2 = makeOAuth2Client(config);
      const { tokens } = await oauth2.getToken(code);

      if (!tokens.refresh_token) {
        backToSetup(
          "No refresh token received. Try removing the app from your Google account permissions and re-adding."
        );
        return;
      }

      // Get the user's email address
      oauth2.setCredentials(tokens);
      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const userInfo = await oauth2Api.userinfo.get();
      const email = userInfo.data.email;

      if (!email) {
        backToSetup("Could not determine email address");
        return;
      }

      store.addAccount(email, tokens.refresh_token);
      accounts.invalidate(email);

      backToSetup(`Successfully connected ${email}`);
    } catch (err: any) {
      console.error("[oauth/callback] Error:", err);
      backToSetup(`Error: ${err.message}`);
    }
  });

  return router;
}
