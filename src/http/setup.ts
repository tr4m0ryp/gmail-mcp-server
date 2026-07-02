import { Router, Request, Response } from "express";
import type { Config } from "../config.js";
import { TokenStore } from "../auth/index.js";
import { AccountService } from "../mcp/index.js";
import { makeRequireAdmin } from "./admin.js";
import { escapeHtml } from "./html.js";

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

    const accountRows =
      connected.length > 0
        ? connected
            .map((a) => {
              const email = escapeHtml(a.email);
              return `
        <tr>
          <td>${email}</td>
          <td>${new Date(a.addedAt).toLocaleDateString()}</td>
          <td>
            <form method="POST" action="/setup/remove?key=${encodeURIComponent(key)}" style="display:inline">
              <input type="hidden" name="email" value="${email}" />
              <button type="submit" onclick="return confirm('Remove this account?')" style="color:red;background:none;border:1px solid red;padding:4px 12px;cursor:pointer">Remove</button>
            </form>
          </td>
        </tr>`;
            })
            .join("")
        : `<tr><td colspan="3" style="text-align:center;color:#888">No accounts connected yet</td></tr>`;

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gmail MCP — Setup</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
        h1 { font-size: 1.5rem; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; }
        th { font-weight: 600; border-bottom: 2px solid #ddd; }
        .btn { display: inline-block; padding: 10px 24px; background: #4285f4; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; }
        .btn:hover { background: #3367d6; }
        .msg { padding: 12px; background: #e8f5e9; border-radius: 6px; margin-bottom: 16px; }
        .msg.error { background: #fce4ec; }
      </style>
    </head>
    <body>
      <h1>Gmail MCP Server — Setup</h1>
      ${message ? `<div class="msg">${escapeHtml(message)}</div>` : ""}
      <table>
        <thead><tr><th>Account</th><th>Added</th><th></th></tr></thead>
        <tbody>${accountRows}</tbody>
      </table>
      <a class="btn" href="/oauth/start?key=${encodeURIComponent(key)}">+ Add Gmail Account</a>
      ${
        connected.length > 0
          ? `
      <div style="margin-top:24px;padding:16px;background:#fff3cd;border-radius:6px">
        <strong>Important:</strong> After adding/removing accounts, copy the value below and paste it as the <code>TOKENS_DATA</code> environment variable in Railway. This ensures accounts survive redeploys.
        <div style="margin-top:8px">
          <textarea readonly style="width:100%;height:60px;font-family:monospace;font-size:11px;box-sizing:border-box" onclick="this.select()">${store.getTokensDataForExport()}</textarea>
        </div>
      </div>
      `
          : ""
      }
      <hr style="margin-top:40px;border:none;border-top:1px solid #eee" />
      <p style="color:#888;font-size:13px">
        MCP endpoint: <code>${config.serverUrl}/mcp</code><br/>
        Connected accounts: ${connected.length}
      </p>
    </body>
    </html>
  `);
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
