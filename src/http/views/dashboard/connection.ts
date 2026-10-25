import { escapeHtml } from "../../html.js";
import { icon } from "../icons.js";

// ---------------------------------------------------------------------------
// Connection card (endpoint + status flags) and the collapsed TOKENS_DATA
// backup panel. Only booleans about auth are rendered, never key values.
// ---------------------------------------------------------------------------

export interface ConnectionView {
  mcpUrl: string;
  fullAccess: boolean;
  apiKeyAuth: boolean;
  authkitAuth: boolean;
}

function accessFact(fullAccess: boolean): string {
  return fullAccess
    ? `<span class="badge badge-warn">Full mailbox</span><span class="fact-hint">Includes permanent delete (mail.google.com scope)</span>`
    : `<span class="badge badge-ok">Standard</span><span class="fact-hint">Read, send, label, trash and filters; no permanent delete</span>`;
}

function authFact(apiKey: boolean, authkit: boolean): string {
  if (apiKey && authkit) return `<span class="badge badge-ok">Bearer key + AuthKit</span>`;
  if (apiKey) return `<span class="badge badge-ok">Bearer key</span><span class="fact-hint">Clients send MCP_API_KEY as a bearer token</span>`;
  if (authkit) return `<span class="badge badge-ok">AuthKit OAuth</span>`;
  return `<span class="badge badge-danger">None</span><span class="fact-hint">Anyone with the URL can use /mcp. Set MCP_API_KEY.</span>`;
}

export function renderConnectionCard(view: ConnectionView): string {
  return `
  <section class="card" aria-labelledby="connection-title">
    <header class="card-head">
      <div>
        <h2 class="card-title" id="connection-title">Connection</h2>
        <p class="card-desc">Point your MCP client at this endpoint.</p>
      </div>
    </header>
    <dl class="facts">
      <div class="fact">
        <dt>MCP endpoint</dt>
        <dd>
          <div class="endpoint">
            <code id="mcp-url">${escapeHtml(view.mcpUrl)}</code>
            <button class="btn btn-quiet" type="button" data-copy="mcp-url" aria-label="Copy MCP endpoint URL">${icon("copy")}<span data-copy-label>Copy</span></button>
          </div>
        </dd>
      </div>
      <div class="fact">
        <dt>Gmail access</dt>
        <dd>${accessFact(view.fullAccess)}</dd>
      </div>
      <div class="fact">
        <dt>Client auth</dt>
        <dd>${authFact(view.apiKeyAuth, view.authkitAuth)}</dd>
      </div>
    </dl>
  </section>`;
}

export function renderBackupPanel(tokensExport: string): string {
  return `
  <details class="card">
    <summary>
      <span>
        <span class="summary-title">Token backup</span>
        <span class="card-desc summary-desc">For hosts without a persistent data volume</span>
      </span>
      ${icon("chevron", "chev")}
    </summary>
    <div class="details-body">
      <p>After adding or removing accounts, copy this value into the <code>TOKENS_DATA</code> environment variable (for example on Railway) so accounts survive redeploys. It contains the encrypted refresh tokens: treat it as sensitive.</p>
      <textarea class="export" id="tokens-data" readonly aria-label="TOKENS_DATA export value" onclick="this.select()">${escapeHtml(tokensExport)}</textarea>
      <div><button class="btn btn-quiet" type="button" data-copy="tokens-data">${icon("copy")}<span data-copy-label>Copy value</span></button></div>
    </div>
  </details>`;
}
