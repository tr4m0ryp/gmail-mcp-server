import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TokenCrypto } from "./crypto.js";

// ---------------------------------------------------------------------------
// Encrypted token store
//
// Persistence strategy (in priority order):
// 1. File on disk (works if volume is mounted or running locally)
// 2. TOKENS_DATA env var (base64-encoded JSON — survives Railway redeploys)
//
// On load: tries file first, falls back to TOKENS_DATA.
// The base64 export for TOKENS_DATA is shown on the /setup page.
// ---------------------------------------------------------------------------

interface StoredAccount {
  email: string;
  refreshToken: string; // encrypted
  addedAt: string;
}

interface StoreData {
  accounts: StoredAccount[];
}

export interface TokenStoreOptions {
  dataDir: string;
  crypto: TokenCrypto;
  tokensData?: string;
}

export class TokenStore {
  private accounts = new Map<string, StoredAccount>();
  private readonly dataDir: string;
  private readonly crypto: TokenCrypto;
  private readonly tokensData?: string;

  constructor(options: TokenStoreOptions) {
    this.dataDir = options.dataDir;
    this.crypto = options.crypto;
    this.tokensData = options.tokensData;
    this.load();
  }

  private dataFile(): string {
    return join(this.dataDir, "accounts.json");
  }

  private load(): void {
    // Try file first
    try {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      const file = this.dataFile();
      if (existsSync(file)) {
        const raw: StoreData = JSON.parse(readFileSync(file, "utf8"));
        for (const acct of raw.accounts ?? []) {
          this.accounts.set(acct.email, acct);
        }
        console.log(`[token-store] Loaded ${this.accounts.size} account(s) from file`);
        return;
      }
    } catch (err) {
      console.error("[token-store] Failed to load from file", err);
    }

    // Fall back to TOKENS_DATA env var
    if (this.tokensData) {
      try {
        const raw: StoreData = JSON.parse(
          Buffer.from(this.tokensData, "base64").toString("utf8")
        );
        for (const acct of raw.accounts ?? []) {
          this.accounts.set(acct.email, acct);
        }
        console.log(
          `[token-store] Loaded ${this.accounts.size} account(s) from TOKENS_DATA env var`
        );
        // Write to file so subsequent saves work
        this.save();
        return;
      } catch (err) {
        console.error("[token-store] Failed to parse TOKENS_DATA env var", err);
      }
    }

    console.log("[token-store] No existing accounts found — starting fresh");
  }

  private save(): void {
    try {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(
        this.dataFile(),
        JSON.stringify(
          { accounts: Array.from(this.accounts.values()) } satisfies StoreData,
          null,
          2
        )
      );
    } catch (err) {
      console.error("[token-store] Failed to write file", err);
    }
  }

  /** Returns base64-encoded token data for copying to the TOKENS_DATA env var */
  getTokensDataForExport(): string {
    const data: StoreData = { accounts: Array.from(this.accounts.values()) };
    return Buffer.from(JSON.stringify(data)).toString("base64");
  }

  addAccount(email: string, refreshToken: string): void {
    this.accounts.set(email, {
      email,
      refreshToken: this.crypto.encrypt(refreshToken),
      addedAt: new Date().toISOString(),
    });
    this.save();
    console.log(`[token-store] Added account: ${email}`);
  }

  removeAccount(email: string): boolean {
    const deleted = this.accounts.delete(email);
    if (deleted) {
      this.save();
      console.log(`[token-store] Removed account: ${email}`);
    }
    return deleted;
  }

  getRefreshToken(email: string): string | null {
    const acct = this.accounts.get(email);
    if (!acct) return null;
    try {
      return this.crypto.decrypt(acct.refreshToken);
    } catch (err) {
      console.error(`[token-store] Failed to decrypt token for ${email}`, err);
      return null;
    }
  }

  listAccounts(): { email: string; addedAt: string }[] {
    return Array.from(this.accounts.values()).map((a) => ({
      email: a.email,
      addedAt: a.addedAt,
    }));
  }

  hasAccount(email: string): boolean {
    return this.accounts.has(email);
  }

  get size(): number {
    return this.accounts.size;
  }
}
