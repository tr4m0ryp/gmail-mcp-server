import { google, gmail_v1 } from "googleapis";
import type { EmailSummary, EmailDetail, UnsubscribeResult } from "./types.js";
import { extractBody } from "./body.js";
import { parseUnsubscribeLinks } from "./links.js";
import { attemptUnsubscribe } from "./unsubscribe.js";
import { findLabelId, getOrCreateLabel, listLabels, LabelInfo } from "./labels.js";
import { batchTrash, BatchTrashRequest, BatchTrashResult } from "./batch.js";
import { createFilter, FilterCriteria, FilterAction, CreatedFilter } from "./filters.js";
import { withScopeHint, FULL_SCOPE_HINT, SETTINGS_SCOPE_HINT } from "./errors.js";

// Cap on concurrent per-message metadata fetches (Gmail API rate limits).
const SUMMARY_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Gmail Service — one instance per access token (per request)
// ---------------------------------------------------------------------------

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async listEmails(
    query?: string,
    maxResults: number = 20
  ): Promise<EmailSummary[]> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: query || undefined,
      maxResults: Math.min(maxResults, 100),
    });

    const messageIds = res.data.messages ?? [];
    if (messageIds.length === 0) return [];

    const summaries: EmailSummary[] = [];
    for (let i = 0; i < messageIds.length; i += SUMMARY_CONCURRENCY) {
      const chunk = messageIds.slice(i, i + SUMMARY_CONCURRENCY);
      summaries.push(
        ...(await Promise.all(chunk.map((m) => this.getEmailSummary(m.id!))))
      );
    }

    return summaries;
  }

  private async getEmailSummary(messageId: string): Promise<EmailSummary> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = res.data.payload?.headers ?? [];
    const hdr = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? "";

    return {
      id: res.data.id!,
      threadId: res.data.threadId!,
      subject: hdr("Subject"),
      from: hdr("From"),
      date: hdr("Date"),
      snippet: res.data.snippet ?? "",
      labelIds: res.data.labelIds ?? [],
    };
  }

  async getEmail(messageId: string): Promise<EmailDetail> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = res.data.payload?.headers ?? [];
    const hdr = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? "";

    const headersMap: Record<string, string> = {};
    for (const h of headers) {
      if (h.name && h.value) headersMap[h.name] = h.value;
    }

    const body = extractBody(res.data.payload ?? {});
    const unsubscribeLinks = parseUnsubscribeLinks(headersMap, body);

    return {
      id: res.data.id!,
      threadId: res.data.threadId!,
      subject: hdr("Subject"),
      from: hdr("From"),
      to: hdr("To"),
      date: hdr("Date"),
      snippet: res.data.snippet ?? "",
      body,
      labelIds: res.data.labelIds ?? [],
      headers: headersMap,
      unsubscribeLinks,
    };
  }

  /** Archive = remove INBOX label; the mail stays in All Mail. */
  async archiveEmail(messageId: string): Promise<{ success: boolean }> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });
    return { success: true };
  }

  async applyLabel(
    messageId: string,
    labelName: string
  ): Promise<{ success: boolean; labelId: string }> {
    const labelId = await getOrCreateLabel(this.gmail, labelName);

    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });

    return { success: true, labelId };
  }

  async removeLabel(
    messageId: string,
    labelName: string
  ): Promise<{ success: boolean; removed: boolean; reason?: string }> {
    const labelId = await findLabelId(this.gmail, labelName);
    if (!labelId) {
      return { success: true, removed: false, reason: "label_not_found" };
    }

    const msg = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "minimal",
    });
    if (!(msg.data.labelIds ?? []).includes(labelId)) {
      return { success: true, removed: false, reason: "label_not_on_message" };
    }

    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: [labelId] },
    });
    return { success: true, removed: true };
  }

  async listLabels(): Promise<LabelInfo[]> {
    return listLabels(this.gmail);
  }

  async trashEmail(messageId: string): Promise<{ id: string; status: "trashed" }> {
    await this.gmail.users.messages.trash({ userId: "me", id: messageId });
    return { id: messageId, status: "trashed" };
  }

  async untrashEmail(messageId: string): Promise<{ id: string; status: "restored" }> {
    await this.gmail.users.messages.untrash({ userId: "me", id: messageId });
    return { id: messageId, status: "restored" };
  }

  async batchTrash(request: BatchTrashRequest): Promise<BatchTrashResult> {
    return batchTrash(this.gmail, request, (id) => this.getEmailSummary(id));
  }

  /** PERMANENT deletion — needs the full https://mail.google.com/ scope. */
  async deleteEmail(messageId: string): Promise<{ id: string; status: "deleted" }> {
    try {
      await this.gmail.users.messages.delete({ userId: "me", id: messageId });
    } catch (err) {
      throw withScopeHint(err, FULL_SCOPE_HINT);
    }
    return { id: messageId, status: "deleted" };
  }

  /** PERMANENT deletion — needs the full https://mail.google.com/ scope. */
  async batchDeleteEmails(
    messageIds: string[]
  ): Promise<{ count: number; ids: string[]; status: "deleted" }> {
    try {
      await this.gmail.users.messages.batchDelete({
        userId: "me",
        requestBody: { ids: messageIds },
      });
    } catch (err) {
      throw withScopeHint(err, FULL_SCOPE_HINT);
    }
    return { count: messageIds.length, ids: messageIds, status: "deleted" };
  }

  async markRead(messageId: string): Promise<{ id: string; status: "read" }> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    return { id: messageId, status: "read" };
  }

  async markUnread(messageId: string): Promise<{ id: string; status: "unread" }> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
    return { id: messageId, status: "unread" };
  }

  async createEmailFilter(
    criteria: FilterCriteria,
    action: FilterAction
  ): Promise<CreatedFilter> {
    try {
      return await createFilter(this.gmail, criteria, action);
    } catch (err) {
      throw withScopeHint(err, SETTINGS_SCOPE_HINT);
    }
  }

  async unsubscribeEmail(messageId: string): Promise<UnsubscribeResult> {
    const email = await this.getEmail(messageId);
    return attemptUnsubscribe(email, {
      sendUnsubscribeMail: (to, subject) => this.sendUnsubscribeMail(to, subject),
    });
  }

  private async sendUnsubscribeMail(
    toAddress: string,
    subject: string
  ): Promise<void> {
    const raw = Buffer.from(
      [
        `To: ${toAddress}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        "",
        "Unsubscribe",
      ].join("\r\n")
    ).toString("base64url");

    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
  }

  /** Same shape as listEmails — a triage batch for the model to decide on. */
  async batchProcess(
    query: string,
    maxResults: number = 20
  ): Promise<EmailSummary[]> {
    return this.listEmails(query, maxResults);
  }
}
