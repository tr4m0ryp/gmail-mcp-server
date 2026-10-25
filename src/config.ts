// ---------------------------------------------------------------------------
// Config — reads and validates environment at startup (fail fast)
// ---------------------------------------------------------------------------

/** Failed admin-login throttling (see http/login-limiter.ts). */
export interface LoginLimits {
  /** Failures per IP inside `windowMs` that trigger a lockout. */
  maxFailures: number;
  windowMs: number;
  lockoutMs: number;
  /** Failures across all IPs inside `windowMs` that block every attempt (0 = off). */
  globalMaxFailures: number;
}

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
  /** Express `trust proxy`: which hops may set X-Forwarded-For (real client IP). */
  trustProxy: boolean | number | string;
  adminLoginLimits: LoginLimits;
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

  const intEnv = (name: string, fallback: number, min: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
      throw new Error(`${name} must be an integer >= ${min} (got "${raw}")`);
    }
    return value;
  };
  const MINUTE = 60 * 1000;
  const adminLoginLimits: LoginLimits = {
    maxFailures: intEnv("ADMIN_LOGIN_MAX_FAILURES", 5, 1),
    windowMs: intEnv("ADMIN_LOGIN_WINDOW_MINUTES", 15, 1) * MINUTE,
    lockoutMs: intEnv("ADMIN_LOGIN_LOCKOUT_MINUTES", 15, 1) * MINUTE,
    globalMaxFailures: intEnv("ADMIN_LOGIN_GLOBAL_MAX_FAILURES", 50, 0),
  };

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
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    adminLoginLimits,
  };
}

/**
 * Default trusts loopback + private ranges: the app binds 127.0.0.1 behind
 * Caddy, and Docker's port proxy connects from the bridge gateway.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (!raw) return "loopback, uniquelocal";
  if (raw === "true" || raw === "false") return raw === "true";
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
