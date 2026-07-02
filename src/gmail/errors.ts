// ---------------------------------------------------------------------------
// Gmail API error translation — surfaces missing-OAuth-scope failures as
// actionable messages instead of raw 403s.
// ---------------------------------------------------------------------------

export const FULL_SCOPE_HINT =
  "Permanent deletion requires the full Gmail scope (https://mail.google.com/), which this account has not granted. " +
  "Set GMAIL_FULL_ACCESS=true on the server, restart it, then re-add the account via the /setup page to re-consent. " +
  "For reversible removal that works right now, use trash_email or batch_trash instead.";

export const SETTINGS_SCOPE_HINT =
  "Managing filters requires the gmail.settings.basic scope, which this account's token predates. " +
  "Re-add the account via the /setup page to re-consent with the current scopes, then retry.";

export function isMissingScopeError(err: any): boolean {
  const status = Number(err?.code ?? err?.status ?? err?.response?.status);
  const message = String(err?.message ?? "");
  return status === 403 && /scope|insufficient|forbidden/i.test(message);
}

/** Replace a missing-scope 403 with an actionable hint; rethrow anything else. */
export function withScopeHint(err: unknown, hint: string): Error {
  if (isMissingScopeError(err)) return new Error(hint);
  return err instanceof Error ? err : new Error(String(err));
}
