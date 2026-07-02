import express, { Express } from "express";
import type { Config } from "../config.js";
import { TokenStore } from "../auth/index.js";
import { AccountService } from "../mcp/index.js";
import { setupRoutes } from "./setup.js";
import { oauthRoutes } from "./oauth.js";
import { mcpRoutes } from "./mcp.js";
import { wellKnownRoutes } from "./mcp-auth.js";

export interface AppDeps {
  config: Config;
  store: TokenStore;
  accounts: AccountService;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      accounts: deps.store.size,
    });
  });

  app.use(setupRoutes(deps));
  app.use(oauthRoutes(deps));
  app.use(mcpRoutes(deps));

  const wellKnown = wellKnownRoutes(deps.config);
  if (wellKnown) app.use(wellKnown);

  return app;
}
