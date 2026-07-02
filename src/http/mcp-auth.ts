import { Router, Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Config } from "../config.js";
import { safeEqual } from "./admin.js";

// ---------------------------------------------------------------------------
// MCP endpoint auth — two interchangeable credentials:
//
// 1. Static bearer (MCP_API_KEY) — for Claude Code, curl, and the Caddy
//    secret-path front.
// 2. WorkOS AuthKit OAuth (WORKOS_AUTHKIT_DOMAIN) — for claude.ai web, which
//    cannot send a static header. The server acts as an OAuth resource
//    server (RFC 9728): it advertises AuthKit as its authorization server
//    and verifies AuthKit-issued JWTs against the tenant's JWKS. AuthKit
//    handles Dynamic Client Registration itself (must be enabled in the
//    WorkOS dashboard).
// ---------------------------------------------------------------------------

class AuthkitVerifier {
  private issuer?: string;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly domain: string) {}

  /** Discover issuer + JWKS lazily so startup doesn't depend on WorkOS. */
  private async init(): Promise<void> {
    if (this.jwks) return;
    const res = await fetch(
      `${this.domain}/.well-known/oauth-authorization-server`
    );
    if (!res.ok) {
      throw new Error(`AuthKit metadata fetch failed: HTTP ${res.status}`);
    }
    const meta: any = await res.json();
    this.issuer = meta.issuer;
    this.jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
  }

  async verify(token: string): Promise<boolean> {
    try {
      await this.init();
      await jwtVerify(token, this.jwks!, { issuer: this.issuer });
      return true;
    } catch {
      return false;
    }
  }
}

export function mcpAuth(config: Config) {
  const verifier = config.workosAuthkitDomain
    ? new AuthkitVerifier(config.workosAuthkitDomain)
    : null;
  const resourceMetadataUrl = `${config.serverUrl}/.well-known/oauth-protected-resource/mcp`;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Authless only when nothing is configured (warned loudly at startup).
    if (!config.mcpApiKey && !verifier) {
      next();
      return;
    }

    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (token) {
      if (config.mcpApiKey && safeEqual(token, config.mcpApiKey)) {
        next();
        return;
      }
      if (verifier && (await verifier.verify(token))) {
        next();
        return;
      }
    }

    if (verifier) {
      // Points OAuth-capable clients (claude.ai) at the discovery document.
      res.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl}"`
      );
    }
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: valid bearer token required" },
      id: null,
    });
  };
}

/** RFC 9728 protected-resource metadata, served only in OAuth mode. */
export function wellKnownRoutes(config: Config): Router | null {
  if (!config.workosAuthkitDomain) return null;

  const router = Router();
  const metadata = {
    resource: `${config.serverUrl}/mcp`,
    authorization_servers: [config.workosAuthkitDomain],
    bearer_methods_supported: ["header"],
  };

  // Both the path-suffixed form (RFC 9728 for resource path /mcp) and the
  // bare form — MCP clients differ in which one they request.
  router.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
    res.json(metadata);
  });
  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json(metadata);
  });

  return router;
}
