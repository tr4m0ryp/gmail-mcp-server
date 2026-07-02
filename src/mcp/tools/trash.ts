import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountService } from "../accounts.js";
import { jsonContent } from "./shared.js";

// ---------------------------------------------------------------------------
// Trash & deletion tools. Trash is reversible (~30 days); delete is permanent,
// gated behind confirm:true, and needs the full https://mail.google.com/ scope.
// ---------------------------------------------------------------------------

const CONFIRM_REFUSAL =
  "Refused: permanent deletion is irreversible and cannot be undone. " +
  "Call again with confirm:true only if the user explicitly wants permanent removal — " +
  "otherwise use trash_email/batch_trash, which Gmail keeps recoverable for ~30 days.";

export function registerTrashTools(
  server: McpServer,
  accounts: AccountService
): void {
  server.tool(
    "trash_email",
    "Move an email to the trash. Reversible for ~30 days via untrash_email — prefer this over permanent deletion.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID to trash"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.trashEmail(message_id)) });
    }
  );

  server.tool(
    "untrash_email",
    "Restore an email from the trash. Note: it returns to All Mail; re-apply INBOX with apply_label if it should reappear in the inbox.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID to restore"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.untrashEmail(message_id)) });
    }
  );

  server.tool(
    "batch_trash",
    "Move many emails to trash at once, selected by a Gmail search query OR an explicit list of message IDs (exactly one). Refuses to act on more than 'max' messages. ALWAYS run with dry_run:true first to preview what would be trashed.",
    {
      account: z
        .string()
        .describe("Email address of the account to act on"),
      query: z
        .string()
        .optional()
        .describe(
          "Gmail search query selecting the emails (e.g. 'category:promotions older_than:1y'). Mutually exclusive with message_ids."
        ),
      message_ids: z
        .array(z.string())
        .optional()
        .describe("Explicit Gmail message IDs to trash. Mutually exclusive with query."),
      max: z
        .number()
        .min(1)
        .max(500)
        .default(50)
        .describe(
          "Safety cap: refuse if more than this many messages would be trashed (default 50)"
        ),
      dry_run: z
        .boolean()
        .default(false)
        .describe("Preview the affected emails (id, subject, from) without trashing"),
    },
    async ({ account, query, message_ids, max, dry_run }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.batchTrash({
        query,
        messageIds: message_ids,
        max,
        dryRun: dry_run,
      });
      return jsonContent({ account, ...result });
    }
  );

  server.tool(
    "delete_email",
    "PERMANENTLY delete an email — it cannot be recovered, not even from trash. Requires confirm:true and the full Gmail scope (GMAIL_FULL_ACCESS). Prefer trash_email unless the user explicitly wants permanent removal.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID to permanently delete"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true — acknowledges the deletion is irreversible"),
    },
    async ({ account, message_id, confirm }) => {
      if (!confirm) throw new Error(CONFIRM_REFUSAL);
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.deleteEmail(message_id)) });
    }
  );

  server.tool(
    "batch_delete",
    "PERMANENTLY delete multiple emails by ID — unrecoverable. Requires confirm:true and the full Gmail scope (GMAIL_FULL_ACCESS). Prefer batch_trash unless the user explicitly wants permanent removal.",
    {
      account: z
        .string()
        .describe("Email address of the account to act on"),
      message_ids: z
        .array(z.string())
        .min(1)
        .describe("Gmail message IDs to permanently delete"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true — acknowledges the deletion is irreversible"),
    },
    async ({ account, message_ids, confirm }) => {
      if (!confirm) throw new Error(CONFIRM_REFUSAL);
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.batchDeleteEmails(message_ids)) });
    }
  );
}
