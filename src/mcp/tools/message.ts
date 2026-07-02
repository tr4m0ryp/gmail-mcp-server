import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountService } from "../accounts.js";
import { jsonContent } from "./shared.js";

// ---------------------------------------------------------------------------
// Message tools — operations on a single email within one account
// ---------------------------------------------------------------------------

export function registerMessageTools(
  server: McpServer,
  accounts: AccountService
): void {
  server.tool(
    "get_email",
    "Get the full content of a specific email including body, headers, and any unsubscribe links found.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      const email = await gmail.getEmail(message_id);
      return jsonContent({ account, ...email });
    }
  );

  server.tool(
    "archive_email",
    "Archive an email by removing it from the inbox. The email remains accessible via search or All Mail.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID to archive"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.archiveEmail(message_id);
      return jsonContent({
        account,
        ...result,
        message: `Email ${message_id} archived successfully.`,
      });
    }
  );

  server.tool(
    "apply_label",
    "Apply a label to an email. Creates the label if it does not already exist.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID"),
      label_name: z
        .string()
        .describe(
          "Label name to apply (e.g. 'Receipts', 'Follow Up'). Created automatically if it does not exist."
        ),
    },
    async ({ account, message_id, label_name }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.applyLabel(message_id, label_name);
      return jsonContent({
        account,
        ...result,
        message: `Label "${label_name}" applied to email ${message_id}.`,
      });
    }
  );

  server.tool(
    "mark_read",
    "Mark an email as read (removes the UNREAD label).",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.markRead(message_id)) });
    }
  );

  server.tool(
    "mark_unread",
    "Mark an email as unread (adds the UNREAD label).",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      return jsonContent({ account, ...(await gmail.markUnread(message_id)) });
    }
  );

  server.tool(
    "unsubscribe_email",
    "Attempt to unsubscribe from a mailing list. Tries RFC 8058 one-click POST, then List-Unsubscribe mailto, then HTTP links from the header and email body.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z
        .string()
        .describe("The Gmail message ID to unsubscribe from"),
    },
    async ({ account, message_id }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.unsubscribeEmail(message_id);
      return jsonContent({ account, ...result });
    }
  );
}
