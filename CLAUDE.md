# gmail-mcp-server

Multi-account Gmail MCP server: Express + Streamable HTTP transport (stateless),
Google OAuth managed server-side, refresh tokens encrypted at rest.

## Commands

- `npm run dev` — tsx watch mode
- `npm run build` — tsc to `dist/`
- `npm start` — run `dist/index.js`

Required env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_PASSWORD`,
`ENCRYPTION_KEY`. Recommended: `MCP_API_KEY` (static bearer on `/mcp`) and/or
`WORKOS_AUTHKIT_DOMAIN` (AuthKit OAuth for claude.ai — server is an RFC 9728
resource server, JWT verification in `src/http/mcp-auth.ts`; needs DCR enabled
in the WorkOS dashboard). Config is validated fail-fast in `src/config.ts`;
add new env vars there.

## Layout

```
src/
  index.ts      entry — wires config, store, accounts, app
  config.ts     env parsing + validation, Gmail OAuth scopes
  auth/         token encryption (crypto.ts), persistence (token-store.ts),
                OAuth2 client factory (google.ts)
  gmail/        Gmail API domain: service.ts (GmailService), types.ts,
                body.ts (MIME extraction), links.ts (unsubscribe discovery),
                unsubscribe.ts (RFC 8058 flow), labels.ts (name->id, create),
                batch.ts (batch_trash cap/dry-run/batchModify), filters.ts,
                errors.ts (missing-scope 403 -> actionable hint)
  mcp/          accounts.ts (account -> GmailService, cached OAuth clients),
                server.ts (McpServer factory), tools/ (search.ts, message.ts,
                trash.ts, labels.ts, shared.ts)
  http/         app.ts (assembly), admin.ts (auth middleware + safeEqual),
                setup.ts, oauth.ts (nonce state store), mcp.ts (transport),
                mcp-auth.ts (bearer + AuthKit JWT auth, RFC 9728 metadata),
                html.ts (escaping)
```

Each module re-exports its public surface from `index.ts`; import across
modules via the module root, siblings directly. ESM with `Node16` resolution —
relative imports need explicit `.js` extensions.

## Conventions

- Dependencies flow one way: `http` -> `mcp` -> `gmail`/`auth` -> `config`.
  Singletons (`TokenStore`, `AccountService`) are created in `src/index.ts`
  and passed down as deps objects — no module-level state elsewhere.
- Tool results are JSON via `jsonContent()` in `mcp/tools/shared.ts`.
  Multi-account tools report per-account failures in an `error` field,
  never silently as empty results.
- Anything rendered into setup-page HTML from request or account data goes
  through `escapeHtml()`. Secrets are compared with `safeEqual()`, never `===`.
- The OAuth `state` param is a single-use server-side nonce — never put
  secrets or user data in it.
- Destructive tools return exactly what they acted on (IDs + count). Batch
  tools enforce a `max` cap and support `dry_run`; permanent deletion is
  gated behind `confirm:true` and the GMAIL_FULL_ACCESS scope (scope
  changes require re-adding accounts via /setup).
