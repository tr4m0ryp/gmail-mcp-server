import express, { Express } from "express";
import type { Config } from "../config.js";
import { TokenStore } from "../auth/index.js";
import { AccountService } from "../mcp/index.js";
import { setupRoutes } from "./setup.js";
import { oauthRoutes } from "./oauth.js";
import { mcpRoutes } from "./mcp.js";
import { wellKnownRoutes } from "./mcp-auth.js";
import { makeRequireAdmin } from "./admin.js";
import { LoginLimiter } from "./login-limiter.js";

export interface AppDeps {
  config: Config;
  store: TokenStore;
  accounts: AccountService;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.set("trust proxy", deps.config.trustProxy);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      accounts: deps.store.size,
    });
  });

  // One limiter shared by every admin-key path, so failures count together.
  const requireAdmin = makeRequireAdmin(
    deps.config.adminPassword,
    new LoginLimiter(deps.config.adminLoginLimits)
  );
  app.use(setupRoutes({ ...deps, requireAdmin }));
  app.use(oauthRoutes({ ...deps, requireAdmin }));
  app.use(mcpRoutes(deps));

  const wellKnown = wellKnownRoutes(deps.config);
  if (wellKnown) app.use(wellKnown);

  return app;
}
