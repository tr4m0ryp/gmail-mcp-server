import { loadConfig } from "./config.js";
import { TokenCrypto, TokenStore } from "./auth/index.js";
import { AccountService } from "./mcp/index.js";
import { buildApp } from "./http/index.js";

const config = loadConfig();

const store = new TokenStore({
  dataDir: config.dataDir,
  crypto: new TokenCrypto(config.encryptionKey),
  tokensData: config.tokensData,
});

const accounts = new AccountService(store, config);
const app = buildApp({ config, store, accounts });

app.listen(config.port, () => {
  console.log(`Gmail MCP server listening on port ${config.port}`);
  console.log(`  MCP endpoint:  ${config.serverUrl}/mcp`);
  console.log(`  Setup page:    ${config.serverUrl}/setup`);
  console.log(`  Health check:  ${config.serverUrl}/health`);
  console.log(`  Accounts:      ${store.size}`);
  const authModes = [
    config.mcpApiKey && "static bearer (MCP_API_KEY)",
    config.workosAuthkitDomain &&
      `WorkOS AuthKit OAuth (${config.workosAuthkitDomain})`,
  ].filter(Boolean);
  if (authModes.length > 0) {
    console.log(`  MCP auth:      ${authModes.join(" + ")}`);
  } else {
    console.warn(
      "[security] Neither MCP_API_KEY nor WORKOS_AUTHKIT_DOMAIN is set — /mcp is UNAUTHENTICATED. Anyone with the URL can read every connected mailbox."
    );
  }
});
