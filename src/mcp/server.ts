import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccountService } from "./accounts.js";
import { registerSearchTools } from "./tools/search.js";
import { registerMessageTools } from "./tools/message.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerLabelTools } from "./tools/labels.js";

export function createMcpServer(accounts: AccountService): McpServer {
  const server = new McpServer({
    name: "gmail-mcp-server",
    version: "1.1.0",
  });

  registerSearchTools(server, accounts);
  registerMessageTools(server, accounts);
  registerTrashTools(server, accounts);
  registerLabelTools(server, accounts);

  return server;
}
