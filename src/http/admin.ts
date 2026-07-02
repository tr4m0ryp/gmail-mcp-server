import { createHash, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";

/** Constant-time string comparison (hash first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const LOGIN_PAGE = `
  <html><body style="font-family:system-ui;max-width:400px;margin:80px auto;text-align:center">
    <h2>Admin Login</h2>
    <form method="GET">
      <input type="password" name="key" placeholder="Admin password" style="padding:8px;width:100%;box-sizing:border-box;margin-bottom:12px" />
      <button type="submit" style="padding:8px 24px">Login</button>
    </form>
  </body></html>
`;

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
      res.status(401).send(LOGIN_PAGE);
      return;
    }
    next();
  };
}
