import { brandMark, renderPage } from "./layout.js";
import { icon } from "./icons.js";

// ---------------------------------------------------------------------------
// Admin login — a GET form with a single `key` field, submitted to the
// current URL (requireAdmin reads it from the query string).
// ---------------------------------------------------------------------------

export interface LoginOptions {
  /** A key was supplied but did not match. */
  failed?: boolean;
  /** Attempts left before lockout (shown once it gets low). */
  remaining?: number;
  /** Too many failures: sign-in is locked for this many seconds. */
  lockedSeconds?: number;
}

const WARN_AT_REMAINING = 2;

function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function errorMessage({ failed, remaining, lockedSeconds }: LoginOptions): string {
  if (lockedSeconds !== undefined) {
    return `Too many failed attempts. Sign-in is locked; try again in ${describeWait(lockedSeconds)}.`;
  }
  if (!failed) return "";
  if (remaining !== undefined && remaining <= WARN_AT_REMAINING) {
    const left = `${remaining} attempt${remaining === 1 ? "" : "s"}`;
    return `Incorrect password. ${left} left before sign-in is temporarily locked.`;
  }
  return "Incorrect password. Try again.";
}

export function renderLoginPage(options: LoginOptions = {}): string {
  const message = errorMessage(options);
  const locked = options.lockedSeconds !== undefined;
  const error = message
    ? `<p class="field-error" id="key-error" role="alert">${icon("alert")}${message}</p>`
    : "";
  const invalid = message ? ` aria-invalid="true" aria-describedby="key-error"` : "";
  const disabled = locked ? " disabled" : "";

  const body = `
<main class="auth">
  <div class="card auth-card">
    ${brandMark()}
    <h1 class="auth-title">Gmail MCP admin</h1>
    <p class="auth-lede">Sign in to manage the Gmail accounts this server can access.</p>
    <form method="GET">
      <div class="field">
        <label class="label" for="key">Admin password</label>
        <input class="input" id="key" type="password" name="key" autocomplete="current-password" autofocus required${invalid}${disabled} />
        ${error}
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit"${disabled}>Sign in</button>
    </form>
  </div>
</main>`;

  return renderPage({ title: "Sign in · Gmail MCP", body });
}
