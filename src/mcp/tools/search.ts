import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountService } from "../accounts.js";
import { collectAcrossAccounts, jsonContent } from "./shared.js";

// ---------------------------------------------------------------------------
// Search tools — account discovery and multi-account queries
// ---------------------------------------------------------------------------

export function registerSearchTools(
  server: McpServer,
  accounts: AccountService
): void {
  server.tool(
    "list_accounts",
    "List all connected Gmail accounts. Use the email addresses returned here as the 'account' parameter in other tools.",
    {},
    async () =>
      jsonContent({
        connected_accounts: accounts.listAccounts(),
        usage_hint:
          "Use any email address as the 'account' parameter, or use 'all' to query every account.",
      })
  );

  server.tool(
    "list_emails",
    "Search and list emails. Supports Gmail search syntax (is:unread, from:, newer_than:7d, etc). Use account='all' to search across all connected accounts.",
    {
      account: z
        .string()
        .describe(
          "Email address of the account to search, or 'all' for every connected account"
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Gmail search query (e.g. 'is:unread', 'from:user@example.com newer_than:2d', 'subject:invoice')"
        ),
      max_results: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of emails to return per account (1-100)"),
    },
    async ({ account, query, max_results }) => {
      const results = await collectAcrossAccounts(accounts, account, (gmail) =>
        gmail.listEmails(query, max_results)
      );
      return jsonContent(results);
    }
  );

  server.tool(
    "batch_process",
    "Fetch a batch of emails matching a query for triage. Returns structured data so you can decide which actions to take on each email. Use account='all' to scan all accounts.",
    {
      account: z
        .string()
        .describe(
          "Email address of the account to search, or 'all' for every connected account"
        ),
      query: z
        .string()
        .describe(
          "Gmail search query (e.g. 'is:unread category:promotions', 'newer_than:7d')"
        ),
      max_results: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of emails to fetch per account"),
    },
    async ({ account, query, max_results }) => {
      const results = await collectAcrossAccounts(accounts, account, (gmail) =>
        gmail.batchProcess(query, max_results)
      );
      return jsonContent({
        total: results.reduce((n, r) => n + r.emails.length, 0),
        query,
        results,
        hint: "Review each email and decide whether to archive, label, unsubscribe, or skip. Use the individual tools with the correct account parameter.",
      });
    }
  );
}
