import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountService } from "../accounts.js";
import { jsonContent } from "./shared.js";

// ---------------------------------------------------------------------------
// Label & filter tools
// ---------------------------------------------------------------------------

export function registerLabelTools(
  server: McpServer,
  accounts: AccountService
): void {
  server.tool(
    "list_labels",
    "List all labels in an account — system labels (INBOX, UNREAD, ...) and user labels — with their IDs and types.",
    {
      account: z.string().describe("Email address of the account"),
    },
    async ({ account }) => {
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, labels: await gmail.listLabels() });
    }
  );

  server.tool(
    "remove_label",
    "Remove a label from an email by label name. Succeeds as a no-op if the label doesn't exist or isn't on the message.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID"),
      label_name: z
        .string()
        .describe("Label name to remove (e.g. 'Receipts', or a system label like 'IMPORTANT')"),
    },
    async ({ account, message_id, label_name }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.removeLabel(message_id, label_name);
      return jsonContent({ account, message_id, label_name, ...result });
    }
  );

  server.tool(
    "create_filter",
    "Create a Gmail filter that automatically labels, archives, or trashes future matching mail. Label names in the action are created if missing. Requires the gmail.settings.basic scope (accounts connected before this scope was added must re-consent via /setup).",
    {
      account: z.string().describe("Email address of the account"),
      criteria: z
        .object({
          from: z.string().optional().describe("Sender address or domain to match"),
          to: z.string().optional().describe("Recipient address to match"),
          subject: z.string().optional().describe("Subject text to match"),
          query: z
            .string()
            .optional()
            .describe("Full Gmail search query (e.g. 'list:newsletter@x.com')"),
        })
        .describe("What incoming mail must match (at least one field)"),
      action: z
        .object({
          add_labels: z
            .array(z.string())
            .optional()
            .describe("Label names to apply (created automatically if missing)"),
          remove_labels: z
            .array(z.string())
            .optional()
            .describe("Label names to remove — use 'INBOX' to auto-archive"),
          should_trash: z
            .boolean()
            .optional()
            .describe("Send matching mail straight to trash"),
        })
        .describe("What to do with matching mail (at least one effect)"),
    },
    async ({ account, criteria, action }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.createEmailFilter(criteria, {
        addLabels: action.add_labels,
        removeLabels: action.remove_labels,
        shouldTrash: action.should_trash,
      });
      return jsonContent({ account, ...result });
    }
  );
}
