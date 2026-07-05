import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountService } from "../accounts.js";
import { jsonContent } from "./shared.js";

// ---------------------------------------------------------------------------
// Compose tools — sending mail, replying in-thread, and managing drafts.
// Sending is outward-facing and irreversible; results echo exactly what was
// sent (recipients + subject + IDs) so the model can report faithfully.
// ---------------------------------------------------------------------------

const recipientList = (what: string) =>
  z.array(z.string()).describe(`${what} — email addresses, 'Name <a@b.c>' allowed`);

export function registerComposeTools(
  server: McpServer,
  accounts: AccountService
): void {
  server.tool(
    "send_email",
    "Send a new email immediately from the given account. There is no undo — use create_draft instead when the user should review before sending.",
    {
      account: z.string().describe("Email address of the account to send from"),
      to: recipientList("Primary recipients").min(1),
      cc: recipientList("CC recipients").optional(),
      bcc: recipientList("BCC recipients").optional(),
      subject: z.string().describe("Subject line"),
      body: z.string().describe("Plain-text body"),
      html_body: z
        .string()
        .optional()
        .describe("Optional HTML body, sent as multipart/alternative with the text body"),
    },
    async ({ account, to, cc, bcc, subject, body, html_body }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.sendEmail({
        to,
        cc,
        bcc,
        subject,
        body,
        htmlBody: html_body,
      });
      return jsonContent({ account, status: "sent", ...result });
    }
  );

  server.tool(
    "reply_email",
    "Reply to an existing email in its thread. Recipients, subject ('Re:'), and threading headers are derived from the original; honors Reply-To. Sends immediately — use create_draft with reply_to_message_id for a reviewable reply.",
    {
      account: z
        .string()
        .describe("Email address of the account this message belongs to"),
      message_id: z.string().describe("The Gmail message ID to reply to"),
      body: z.string().describe("Plain-text reply body"),
      html_body: z
        .string()
        .optional()
        .describe("Optional HTML body, sent as multipart/alternative with the text body"),
      reply_all: z
        .boolean()
        .default(false)
        .describe("Also CC everyone on the original To/Cc lines (minus yourself)"),
    },
    async ({ account, message_id, body, html_body, reply_all }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.replyEmail(message_id, {
        body,
        htmlBody: html_body,
        replyAll: reply_all,
        selfAddress: account,
      });
      return jsonContent({ account, status: "sent", in_reply_to: message_id, ...result });
    }
  );

  server.tool(
    "create_draft",
    "Create a draft without sending it. Pass reply_to_message_id to draft a threaded reply — recipients and subject are then derived from the original unless given explicitly. Send later with send_draft.",
    {
      account: z.string().describe("Email address of the account to draft in"),
      to: recipientList("Primary recipients").default([]),
      cc: recipientList("CC recipients").optional(),
      bcc: recipientList("BCC recipients").optional(),
      subject: z.string().default("").describe("Subject line"),
      body: z.string().describe("Plain-text body"),
      html_body: z
        .string()
        .optional()
        .describe("Optional HTML body, sent as multipart/alternative with the text body"),
      reply_to_message_id: z
        .string()
        .optional()
        .describe("Gmail message ID to draft a reply to (threads the draft)"),
      reply_all: z
        .boolean()
        .default(false)
        .describe("When drafting a reply: include everyone on the original To/Cc lines"),
    },
    async ({
      account,
      to,
      cc,
      bcc,
      subject,
      body,
      html_body,
      reply_to_message_id,
      reply_all,
    }) => {
      if (to.length === 0 && !reply_to_message_id) {
        throw new Error(
          "create_draft needs at least one recipient in 'to' (or a reply_to_message_id to derive one)."
        );
      }
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.createDraft(
        { to, cc, bcc, subject, body, htmlBody: html_body },
        reply_to_message_id
          ? { messageId: reply_to_message_id, replyAll: reply_all, selfAddress: account }
          : undefined
      );
      return jsonContent({ account, status: "draft_created", ...result });
    }
  );

  server.tool(
    "send_draft",
    "Send an existing draft by its draft ID. Sends to the recipients stored on the draft — list_drafts shows them. There is no undo.",
    {
      account: z.string().describe("Email address of the account the draft belongs to"),
      draft_id: z.string().describe("The Gmail draft ID (from create_draft or list_drafts)"),
    },
    async ({ account, draft_id }) => {
      const gmail = await accounts.getGmailService(account);
      const result = await gmail.sendDraft(draft_id);
      return jsonContent({ account, status: "sent", draftId: draft_id, ...result });
    }
  );

  server.tool(
    "list_drafts",
    "List drafts in an account with recipients, subject, and snippet. Supports Gmail search syntax to filter.",
    {
      account: z.string().describe("Email address of the account to list drafts from"),
      query: z
        .string()
        .optional()
        .describe("Optional Gmail search query to filter drafts (e.g. 'to:alice@example.com')"),
      max_results: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of drafts to return (default 20)"),
    },
    async ({ account, query, max_results }) => {
      const gmail = await accounts.getGmailService(account);
      const drafts = await gmail.listDrafts(query, max_results);
      return jsonContent({ account, count: drafts.length, drafts });
    }
  );
}
