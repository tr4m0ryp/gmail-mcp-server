import { createHash, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { renderLoginPage } from "./views/index.js";
import type { LoginLimiter } from "./login-limiter.js";

/** Constant-time string comparison (hash first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Real client IP. Express resolves it from X-Forwarded-For only for hops
 * matched by the `trust proxy` setting (Caddy in front, app bound locally).
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** The admin key from any accepted channel: query, header, or form body. */
export function readAdminKey(req: Request): string | undefined {
  const candidates = [
    req.query.key,
    req.headers["x-admin-key"],
    (req.body as Record<string, unknown> | undefined)?.key,
  ];
  return candidates.find((v): v is string => typeof v === "string" && v !== "");
}

function sendLocked(res: Response, retryAfterMs: number): void {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  res
    .status(429)
    .set("Retry-After", String(seconds))
    .send(renderLoginPage({ lockedSeconds: seconds }));
}

/**
 * Admin guard for every admin-key path. Throttles failed attempts per client
 * IP (and globally) before comparing the key, so a locked-out caller learns
 * nothing even when it guesses right.
 */
export function makeRequireAdmin(
  adminPassword: string,
  limiter: LoginLimiter
): RequestHandler {
  return function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const ip = clientIp(req);
    const status = limiter.check(ip);
    if (status.blocked) {
      sendLocked(res, status.retryAfterMs);
      return;
    }

    const key = readAdminKey(req);
    if (!key) {
      res.status(401).send(renderLoginPage());
      return;
    }
    if (safeEqual(key, adminPassword)) {
      limiter.recordSuccess(ip);
      next();
      return;
    }

    const after = limiter.recordFailure(ip);
    if (after.blocked) {
      console.warn(`[admin] login locked for ${ip} after repeated failures`);
      sendLocked(res, after.retryAfterMs);
      return;
    }
    res.status(401).send(renderLoginPage({ failed: true, remaining: after.remaining }));
  };
}
