import type { Auth } from "googleapis";
import type { Config } from "../config.js";
import { TokenStore, makeOAuth2Client } from "../auth/index.js";
import { GmailService } from "../gmail/index.js";

// ---------------------------------------------------------------------------
// AccountService — resolves account names to authenticated GmailService
// instances. Keeps one OAuth2 client per account so access tokens are
// reused until expiry instead of re-exchanged on every tool call.
// ---------------------------------------------------------------------------

interface CachedClient {
  refreshToken: string;
  client: Auth.OAuth2Client;
}

export class AccountService {
  private clients = new Map<string, CachedClient>();

  constructor(
    private readonly store: TokenStore,
    private readonly config: Config
  ) {}

  listAccounts(): { email: string; addedAt: string }[] {
    return this.store.listAccounts();
  }

  /** Drop the cached client (call after an account is removed or re-added). */
  invalidate(email: string): void {
    this.clients.delete(email);
  }

  async getGmailService(email: string): Promise<GmailService> {
    const refreshToken = this.store.getRefreshToken(email);
    if (!refreshToken) {
      throw new Error(
        `Account "${email}" is not connected. Use list_accounts to see connected accounts, or add it via the /setup page.`
      );
    }

    let cached = this.clients.get(email);
    if (!cached || cached.refreshToken !== refreshToken) {
      const client = makeOAuth2Client(this.config);
      client.setCredentials({ refresh_token: refreshToken });
      cached = { refreshToken, client };
      this.clients.set(email, cached);
    }

    const { token } = await cached.client.getAccessToken();
    if (!token) {
      throw new Error(
        `Failed to get access token for "${email}". The account may need to be re-authorized via /setup.`
      );
    }

    return new GmailService(token);
  }

  resolveAccounts(account: string): string[] {
    if (account.toLowerCase() === "all") {
      const all = this.store.listAccounts().map((a) => a.email);
      if (all.length === 0) {
        throw new Error("No accounts connected. Add accounts via the /setup page.");
      }
      return all;
    }
    if (!this.store.hasAccount(account)) {
      const available = this.store.listAccounts().map((a) => a.email);
      throw new Error(
        `Account "${account}" is not connected. Available accounts: ${available.join(", ") || "none"}`
      );
    }
    return [account];
  }
}
