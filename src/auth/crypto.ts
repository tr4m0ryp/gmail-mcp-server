import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

// ---------------------------------------------------------------------------
// TokenCrypto — AES-256-GCM around stored refresh tokens.
// The scrypt key derivation is expensive, so it runs once per process.
// ---------------------------------------------------------------------------

export class TokenCrypto {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = scryptSync(secret, "gmail-mcp-salt", 32);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString("hex"),
      tag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":");
  }

  decrypt(blob: string): string {
    const parts = blob.split(":");
    if (parts.length !== 3) {
      throw new Error("Malformed encrypted token blob");
    }
    const [ivHex, tagHex, encHex] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }
}
