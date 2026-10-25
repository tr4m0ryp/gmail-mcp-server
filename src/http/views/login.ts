import { brandMark, renderPage } from "./layout.js";
import { icon } from "./icons.js";

// ---------------------------------------------------------------------------
// Admin login — a GET form with a single `key` field, submitted to the
// current URL (requireAdmin reads it from the query string).
// ---------------------------------------------------------------------------

export interface LoginOptions {
  /** A key was supplied but did not match. */
  failed?: boolean;
}

export function renderLoginPage({ failed = false }: LoginOptions = {}): string {
  const error = failed
    ? `<p class="field-error" id="key-error" role="alert">${icon("alert")}Incorrect password. Try again.</p>`
    : "";
  const invalid = failed ? ` aria-invalid="true" aria-describedby="key-error"` : "";

  const body = `
<main class="auth">
  <div class="card auth-card">
    ${brandMark()}
    <h1 class="auth-title">Gmail MCP admin</h1>
    <p class="auth-lede">Sign in to manage the Gmail accounts this server can access.</p>
    <form method="GET">
      <div class="field">
        <label class="label" for="key">Admin password</label>
        <input class="input" id="key" type="password" name="key" autocomplete="current-password" autofocus required${invalid} />
        ${error}
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
    </form>
  </div>
</main>`;

  return renderPage({ title: "Sign in · Gmail MCP", body });
}
