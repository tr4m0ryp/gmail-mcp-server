import { escapeHtml } from "../../html.js";
import { icon } from "../icons.js";

// ---------------------------------------------------------------------------
// Connected-accounts card: list of rows, or an empty state with a primary
// "Add Gmail Account" action. Form fields and routes match setup.ts.
// ---------------------------------------------------------------------------

export interface AccountView {
  email: string;
  addedAt: string;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Escaped email with a soft line-break opportunity before the "@". */
function emailMarkup(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return escapeHtml(email);
  return `${escapeHtml(email.slice(0, at))}<wbr>${escapeHtml(email.slice(at))}`;
}

function accountRow(account: AccountView, keyParam: string): string {
  const email = escapeHtml(account.email);
  const initial = escapeHtml((account.email.trim()[0] ?? "?").toUpperCase());
  const confirmText = escapeHtml(
    `Remove ${account.email}? MCP clients will lose access to this mailbox until it is added again.`
  );
  return `
      <li class="row">
        <span class="avatar" aria-hidden="true">${initial}</span>
        <div class="row-main">
          <p class="row-email">${emailMarkup(account.email)}</p>
          <p class="row-meta">Connected <time datetime="${escapeHtml(account.addedAt)}">${escapeHtml(formatDate(account.addedAt))}</time></p>
        </div>
        <form method="POST" action="/setup/remove?key=${keyParam}" data-confirm="${confirmText}">
          <input type="hidden" name="email" value="${email}" />
          <button class="btn btn-danger" type="submit" aria-label="Remove ${email}">${icon("trash")}<span class="btn-label">Remove</span></button>
        </form>
      </li>`;
}

export function renderAccountsCard(accounts: AccountView[], keyParam: string): string {
  const addHref = `/oauth/start?key=${keyParam}`;

  if (accounts.length === 0) {
    return `
  <section class="card" aria-labelledby="accounts-title">
    <header class="card-head">
      <div>
        <h2 class="card-title" id="accounts-title">Connected accounts <span class="count">0</span></h2>
        <p class="card-desc">Mailboxes this MCP server can read and act on.</p>
      </div>
    </header>
    <div class="empty">
      <div class="empty-icon">${icon("mail")}</div>
      <h3 class="empty-title">No Gmail accounts yet</h3>
      <p class="empty-text">Connect a Gmail account through Google sign-in. Its refresh token is stored encrypted on this server.</p>
      <a class="btn btn-primary btn-lg" href="${addHref}">${icon("plus")}Add Gmail Account</a>
    </div>
  </section>`;
  }

  return `
  <section class="card" aria-labelledby="accounts-title">
    <header class="card-head">
      <div>
        <h2 class="card-title" id="accounts-title">Connected accounts <span class="count">${accounts.length}</span></h2>
        <p class="card-desc">Mailboxes this MCP server can read and act on.</p>
      </div>
      <a class="btn btn-primary" href="${addHref}">${icon("plus")}Add Gmail Account</a>
    </header>
    <ul class="list">${accounts.map((a) => accountRow(a, keyParam)).join("")}
    </ul>
  </section>`;
}
