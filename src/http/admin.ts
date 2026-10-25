import { createHash, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { renderLoginPage } from "./views/index.js";

/** Constant-time string comparison (hash first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function makeRequireAdmin(adminPassword: string) {
  return function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const key =
      (req.query.key as string | undefined) ??
      (req.headers["x-admin-key"] as string | undefined);

    if (!key || !safeEqual(key, adminPassword)) {
      res.status(401).send(renderLoginPage({ failed: Boolean(key) }));
      return;
    }
    next();
  };
}
