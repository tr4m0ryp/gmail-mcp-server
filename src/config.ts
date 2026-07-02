// ---------------------------------------------------------------------------
// Config — reads and validates environment at startup (fail fast)
// ---------------------------------------------------------------------------

export interface Config {
  port: number;
  serverUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  adminPassword: string;
  encryptionKey: string;
  /** Optional bearer token required on /mcp. Strongly recommended for public deploys. */
  mcpApiKey?: string;
  /**
   * Optional WorkOS AuthKit domain (https://<slug>.authkit.app). When set,
   * /mcp also accepts AuthKit-issued OAuth tokens and advertises AuthKit via
   * RFC 9728 protected-resource metadata, so claude.ai can drive a real
   * OAuth login (requires Dynamic Client Registration enabled in WorkOS).
   */
  workosAuthkitDomain?: string;
  dataDir: string;
  /** Base64 token snapshot injected via env (Railway redeploy persistence). */
  tokensData?: string;
  /** OAuth scopes requested when connecting accounts (GMAIL_FULL_ACCESS widens them). */
  scopes: string[];
}

// gmail.modify covers read/trash/labels; settings.basic adds filter management.
const BASE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/userinfo.email",
];

// Full mailbox scope — the only scope Gmail accepts for PERMANENT deletion.
const FULL_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function loadConfig(): Config {
  const missing: string[] = [];
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) missing.push(name);
    return value ?? "";
  };

  const googleClientId = required("GOOGLE_CLIENT_ID");
  const googleClientSecret = required("GOOGLE_CLIENT_SECRET");
  const adminPassword = required("ADMIN_PASSWORD");
  const encryptionKey = required("ENCRYPTION_KEY");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const port = parseInt(process.env.PORT || "3000", 10);

  return {
    port,
    serverUrl: process.env.SERVER_URL || `http://localhost:${port}`,
    googleClientId,
    googleClientSecret,
    adminPassword,
    encryptionKey,
    mcpApiKey: process.env.MCP_API_KEY || undefined,
    workosAuthkitDomain:
      process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/+$/, "") || undefined,
    dataDir: process.env.DATA_DIR || "./data",
    tokensData: process.env.TOKENS_DATA || undefined,
    scopes: process.env.GMAIL_FULL_ACCESS === "true" ? FULL_SCOPES : BASE_SCOPES,
  };
}
