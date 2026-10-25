import { Router, Request, Response } from "express";
import type { Config } from "../config.js";
import { TokenStore } from "../auth/index.js";
import { AccountService } from "../mcp/index.js";
import { makeRequireAdmin } from "./admin.js";
import { renderSetupPage } from "./views/index.js";

// ---------------------------------------------------------------------------
// Setup page — manage connected Gmail accounts
// ---------------------------------------------------------------------------

export interface SetupDeps {
  config: Config;
  store: TokenStore;
  accounts: AccountService;
}

export function setupRoutes({ config, store, accounts }: SetupDeps): Router {
  const router = Router();
  const requireAdmin = makeRequireAdmin(config.adminPassword);

  router.get("/setup", requireAdmin, (req: Request, res: Response) => {
    const connected = store.listAccounts();
    const key = req.query.key as string;
    const message = req.query.message as string | undefined;

    res.send(
      renderSetupPage({
        key,
        message,
        accounts: connected,
        tokensExport: () => store.getTokensDataForExport(),
        mcpUrl: `${config.serverUrl}/mcp`,
        fullAccess: config.scopes.includes("https://mail.google.com/"),
        apiKeyAuth: Boolean(config.mcpApiKey),
        authkitAuth: Boolean(config.workosAuthkitDomain),
      })
    );
  });

  router.post("/setup/remove", requireAdmin, (req: Request, res: Response) => {
    const email = req.body.email;
    const key = req.query.key as string;

    if (email && store.hasAccount(email)) {
      store.removeAccount(email);
      accounts.invalidate(email);
      res.redirect(
        `/setup?key=${encodeURIComponent(key)}&message=${encodeURIComponent(`Removed ${email}`)}`
      );
    } else {
      res.redirect(
        `/setup?key=${encodeURIComponent(key)}&message=${encodeURIComponent("Account not found")}`
      );
    }
  });

  return router;
}
