# Gmail MCP Server: Multi-Account Gmail for AI Agents

![Gmail MCP Server Banner](banner.png)

**A self-hosted Model Context Protocol server for Gmail.** Connect multiple accounts and give Claude — or any MCP client — 17 tools to search, triage, label, trash, unsubscribe, and filter mail, with encrypted token storage and server-side safety rails.

## Project Overview

AI assistants ship with Gmail integrations that read a single inbox and stop there: no archiving, no labeling, no trash, no unsubscribe, no filters, and no second account. Real mailbox maintenance — triaging years of promotions, unsubscribing from dead newsletters, filing receipts, setting up filters so the mess does not return — needs write access, batch operations, and safety rails, across every account you own.

This project is a self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server that gives any MCP client full read and write control over multiple Gmail accounts through **17 tools**. It runs as a single stateless HTTP service you deploy once; accounts are connected through a password-protected setup page using Google OAuth, and refresh tokens are stored **AES-256-GCM encrypted** at rest.

Two authentication modes cover the two kinds of MCP clients: a **static bearer token** for clients that can send headers (Claude Code, Cursor, curl), and **OAuth 2.1 via WorkOS AuthKit** (RFC 9728 resource server) for claude.ai's web connector, which cannot. Destructive operations are engineered defensively: batch trash is capped and previewable, permanent deletion sits behind an explicit `confirm:true` gate and a separate opt-in OAuth scope.

## How It Works

```
Claude Code / Cursor / curl              claude.ai (web connector)
  Authorization: Bearer <MCP_API_KEY>      OAuth 2.1 login via WorkOS AuthKit
        |                                        |
        +--------------------+-------------------+
                             v
                POST /mcp  (Streamable HTTP, stateless)
                             |
                     auth middleware
          static bearer  OR  AuthKit JWT (verified via JWKS)
                             |
                McpServer -- fresh instance per request
                             |
                     AccountService
        account email -> cached OAuth2 client -> access token
                             |
                     Gmail API (googleapis)
```

1. **Connecting an account** happens once, in a browser: the admin opens `/setup` (password-protected), clicks *Add Gmail Account*, and completes Google's consent screen. The server exchanges the code for a refresh token, encrypts it (AES-256-GCM, key derived via scrypt), and persists it to `data/accounts.json`. The OAuth `state` parameter is a single-use server-side nonce — nothing sensitive travels through Google's redirect chain.
2. **Serving a tool call**: every `/mcp` request is authenticated, gets a fresh MCP server instance, resolves the `account` parameter (a connected address, or `all` to fan out), and reuses a cached per-account OAuth client so access tokens are only re-exchanged when they expire.
3. **Failing loudly**: per-account errors are returned in an `error` field next to the results — an expired token is distinguishable from an empty inbox. Missing-scope 403s from Gmail are translated into messages that say exactly which scope and which re-consent step is needed.

## Tools

| Tool | Description |
|---|---|
| `list_accounts` | List all connected Gmail accounts |
| `list_emails` | Search emails with Gmail query syntax. Supports `account="all"` |
| `get_email` | Full content, headers, and parsed unsubscribe links |
| `batch_process` | Fetch a batch of emails for triage. Supports `account="all"` |
| `archive_email` | Remove an email from the inbox (stays in All Mail) |
| `apply_label` / `remove_label` | Add or remove a label by name; labels are created on demand, removal is a clean no-op if absent |
| `list_labels` | All labels with IDs and types |
| `mark_read` / `mark_unread` | Toggle the UNREAD label |
| `trash_email` / `untrash_email` | Move to trash / restore (reversible for ~30 days) |
| `batch_trash` | Trash by query or explicit ID list; refuses to exceed `max` (default 50); `dry_run:true` previews id/subject/from without acting |
| `delete_email` / `batch_delete` | **Permanent** deletion; requires `confirm:true` and the full Gmail scope |
| `unsubscribe_email` | RFC 8058 one-click POST first, then `mailto:`, then header/body links |
| `create_filter` | Auto-label, auto-archive, or auto-trash future matching mail |

### OAuth scopes

| Capability | Scope | Requested |
|---|---|---|
| Read, archive, label, trash, mark read | `gmail.modify` | Always |
| Filters (`create_filter`) | `gmail.settings.basic` | Always |
| Permanent delete (`delete_email`, `batch_delete`) | `https://mail.google.com/` | Only with `GMAIL_FULL_ACCESS=true` |

Changing scopes requires re-adding affected accounts via `/setup` (Google re-consent). Everything except permanent deletion works under the default scopes — this is deliberate; the full-mailbox scope is the only one Gmail accepts for `messages.delete`.

## Quick Start

### 1. Create a Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com), create or pick a project and enable the **Gmail API**.
2. Configure the OAuth consent screen (External). Add the Gmail addresses you will connect as **test users** — or publish the app to production so refresh tokens do not expire after 7 days.
3. Create an OAuth client ID of type **Web application** with the redirect URI `https://<your-server>/oauth/callback`.

### 2. Deploy the server

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | The OAuth client from step 1 |
| `ADMIN_PASSWORD` | Guards the `/setup` page |
| `ENCRYPTION_KEY` | Random string (32+ chars); encrypts stored refresh tokens |
| `SERVER_URL` | Public HTTPS base URL of this server |
| `MCP_API_KEY` | Static bearer token for `/mcp` (recommended) |
| `WORKOS_AUTHKIT_DOMAIN` | AuthKit tenant for claude.ai OAuth (optional) |
| `GMAIL_FULL_ACCESS` | `true` to request the permanent-deletion scope |
| `DATA_DIR` / `TOKENS_DATA` | Token storage directory / base64 env fallback |

Without `MCP_API_KEY` **and** without `WORKOS_AUTHKIT_DOMAIN`, `/mcp` is unauthenticated — anyone with the URL can read every connected mailbox. The server warns loudly at startup; do not run a public deployment that way.

<details>
<summary>Self-host (Node 20+)</summary>

```bash
git clone https://github.com/tr4m0ryp/gmail-mcp-server.git
cd gmail-mcp-server
npm ci
cp .env.example .env   # fill in values
npm run build
npm start
```
</details>

<details>
<summary>Docker</summary>

```bash
docker build -t gmail-mcp-server .
docker run -p 3000:3000 --env-file .env -v "$PWD/data:/app/data" gmail-mcp-server
```

Mount `/app/data` so connected accounts survive container replacement. claude.ai requires HTTPS — put a TLS proxy (Caddy, nginx, a platform load balancer) in front, or deploy on a platform that terminates TLS (Railway, Cloud Run).
</details>

### 3. Connect accounts

Open `https://<your-server>/setup`, enter the admin password, click **+ Add Gmail Account**, and complete Google sign-in. Repeat per account. `/health` reports the connected-account count.

## Usage

**claude.ai (web)** — requires `WORKOS_AUTHKIT_DOMAIN` set and *Dynamic Client Registration* enabled in the WorkOS dashboard (Applications -> Configuration). Settings -> Connectors -> Add custom connector -> URL `https://<your-server>/mcp`, OAuth fields blank. claude.ai discovers AuthKit via the RFC 9728 metadata and drives the login itself. Anyone who can log in to your AuthKit tenant gets mailbox access — restrict sign-ups.

**Claude Code / header-capable clients** — send the static bearer:

```bash
claude mcp add gmail --transport http https://<your-server>/mcp \
  --header "Authorization: Bearer <MCP_API_KEY>"
```

**Cursor / Windsurf / Cline** — point the MCP config at `https://<your-server>/mcp` with the same `Authorization` header.

Then, in a conversation:

```
"List my connected Gmail accounts"
"Find unread newsletters older than a month across all accounts,
 dry-run a batch trash, show me the list, then do it"
"Unsubscribe me from everything I haven't opened this year"
"Create a filter that archives receipts from amazon.com into a Receipts label"
```

The Gmail query language works everywhere a `query` parameter appears: `is:unread`, `from:user@example.com`, `newer_than:7d`, `category:promotions`, `has:attachment`, `larger:5M`, `after:2025/01/01 before:2025/02/01`.

## Technical Details

```
src/
  index.ts      entry -- wires config, token store, accounts, HTTP app
  config.ts     fail-fast env validation, scope selection
  auth/         AES-256-GCM token crypto, encrypted TokenStore,
                Google OAuth2 client factory
  gmail/        GmailService + domain logic: MIME body extraction,
                unsubscribe (RFC 8058), labels, batch trash, filters,
                scope-error translation
  mcp/          account resolution with cached OAuth clients,
                McpServer factory, tools/ (search, message, trash, labels)
  http/         Express assembly: admin auth (timing-safe), setup page,
                OAuth routes (nonce state store), MCP transport,
                bearer + AuthKit JWT auth, RFC 9728 metadata
```

Design decisions worth knowing:

- **Stateless MCP transport.** Each request builds and tears down a server instance; there is no session state to leak or replay. Horizontal scaling only needs a shared `data/` volume.
- **Two auth modes, one endpoint.** The auth middleware accepts either credential; discovery metadata (`/.well-known/oauth-protected-resource`) is only served when AuthKit is configured. Missing both falls back to authless with a startup warning, for local development.
- **Safety rails are server-side, not prompt-side.** The cap on `batch_trash`, the `confirm:true` gate on deletion, and the dry-run preview are enforced in code, so a confused model cannot bulk-delete by accident.
- **Timing-safe comparisons** for the admin password and bearer token; secrets never appear in OAuth `state` or logs.

## Roadmap

- `send_email` / draft tools (compose, reply)
- Session-cookie admin auth with rate limiting (replacing the query-string password)
- SSRF guard for unsubscribe link fetching (private-IP blocklist or confirm-first mode)
- Unit tests for the pure domain logic (body extraction, link parsing, crypto round-trip)
- Multi-stage Docker build

## Disclaimer & License

This server holds OAuth refresh tokens for every mailbox you connect. Treat the host, the `ENCRYPTION_KEY`, and the MCP credentials like the mailbox passwords they effectively are. `unsubscribe_email` visits links found in emails, which can confirm to a sender that your address is live — use it on mail you already receive, not suspected spam. Permanent deletion is exactly that; nothing recovers a hard-deleted message. Access is revocable anytime at [Google Account Permissions](https://myaccount.google.com/permissions).

MIT License. Fork of [navbuildz/gmail-mcp-server](https://github.com/navbuildz/gmail-mcp-server), substantially restructured and extended.
