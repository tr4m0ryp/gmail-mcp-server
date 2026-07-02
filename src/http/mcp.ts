import { Router, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "../config.js";
import { AccountService, createMcpServer } from "../mcp/index.js";
import { mcpAuth } from "./mcp-auth.js";

// ---------------------------------------------------------------------------
// MCP transport — Streamable HTTP (stateless: each request gets a fresh
// server instance). Auth (static bearer and/or WorkOS AuthKit OAuth) is
// handled by the mcpAuth middleware.
// ---------------------------------------------------------------------------

export interface McpRouteDeps {
  config: Config;
  accounts: AccountService;
}

export function mcpRoutes({ config, accounts }: McpRouteDeps): Router {
  const router = Router();

  router.post("/mcp", mcpAuth(config), async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no session tracking
      });

      const mcpServer = createMcpServer(accounts);
      await mcpServer.connect(transport);

      await transport.handleRequest(req, res, req.body);

      // Clean up after response is sent
      res.on("close", () => {
        mcpServer.close().catch(() => {});
        transport.close().catch(() => {});
      });
    } catch (err: any) {
      console.error("[mcp] Error handling request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: err.message },
          id: null,
        });
      }
    }
  });

  router.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "SSE streams not supported in stateless mode. Use POST.",
      },
      id: null,
    });
  });

  router.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session management not used in stateless mode." },
      id: null,
    });
  });

  return router;
}
