import { escapeHtml } from "../../html.js";
import { icon } from "../icons.js";
import { brandMark, renderPage } from "../layout.js";
import { renderAccountsCard, type AccountView } from "./accounts.js";
import { renderBackupPanel, renderConnectionCard, type ConnectionView } from "./connection.js";
import { DASHBOARD_SCRIPT } from "./script.js";

// ---------------------------------------------------------------------------
// /setup dashboard — composes the flash message, accounts card, connection
// card and (when accounts exist) the TOKENS_DATA backup panel.
// ---------------------------------------------------------------------------

export interface SetupView extends ConnectionView {
  /** Admin key exactly as received in the query (re-used in action URLs). */
  key: string;
  message?: string;
  accounts: AccountView[];
  /** Lazily produced TOKENS_DATA export; only called when accounts exist. */
  tokensExport: () => string;
}

const SUCCESS_MESSAGE = /^(Successfully|Removed)\b/;

function renderFlash(message: string | undefined): string {
  if (!message) return "";
  const ok = SUCCESS_MESSAGE.test(message);
  return `
  <div class="flash ${ok ? "flash-ok" : "flash-error"}" role="${ok ? "status" : "alert"}">
    ${icon(ok ? "success" : "alert")}<p>${escapeHtml(message)}</p>
  </div>`;
}

export function renderSetupPage(view: SetupView): string {
  const keyParam = escapeHtml(encodeURIComponent(view.key));
  const backup = view.accounts.length > 0 ? renderBackupPanel(view.tokensExport()) : "";

  const body = `
<div class="shell">
  <header class="topbar">
    ${brandMark()}
    <div>
      <h1 class="brand-name">Gmail MCP</h1>
      <p class="brand-sub">Server admin</p>
    </div>
  </header>
  <main class="stack">
    ${renderFlash(view.message)}
    ${renderAccountsCard(view.accounts, keyParam)}
    ${renderConnectionCard(view)}
    ${backup}
  </main>
</div>`;

  return renderPage({ title: "Gmail MCP · Setup", body, script: DASHBOARD_SCRIPT });
}
