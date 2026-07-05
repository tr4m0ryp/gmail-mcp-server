import type { gmail_v1 } from "googleapis";
import {
  buildMimeMessage,
  splitAddressList,
  bareAddress,
  MimeMessage,
} from "./mime.js";

// ---------------------------------------------------------------------------
// Compose operations — sending mail, reply threading, and draft management.
// ---------------------------------------------------------------------------

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
}

export interface SentEmail {
  id: string;
  threadId: string;
  labelIds: string[];
  to: string[];
  subject: string;
}

export interface CreatedDraft {
  draftId: string;
  messageId: string;
  threadId: string;
  to: string[];
  subject: string;
}

export interface DraftSummary {
  draftId: string;
  messageId: string;
  threadId: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

interface ReplyContext {
  to: string[];
  cc: string[];
  subject: string;
  threadId: string;
  inReplyTo?: string;
  references?: string;
}

// Cap on concurrent per-draft metadata fetches (Gmail API rate limits).
const DRAFT_CONCURRENCY = 10;

function toMime(email: OutgoingEmail, reply?: ReplyContext): MimeMessage {
  return {
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    textBody: email.body,
    htmlBody: email.htmlBody,
    inReplyTo: reply?.inReplyTo,
    references: reply?.references,
  };
}

export async function sendEmail(
  gmail: gmail_v1.Gmail,
  email: OutgoingEmail,
  reply?: ReplyContext
): Promise<SentEmail> {
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildMimeMessage(toMime(email, reply)),
      threadId: reply?.threadId,
    },
  });
  return {
    id: res.data.id!,
    threadId: res.data.threadId!,
    labelIds: res.data.labelIds ?? [],
    to: email.to,
    subject: email.subject,
  };
}

/**
 * Derive recipients, subject, and threading headers for a reply. Honors
 * Reply-To, prefixes "Re:" once, and extends the References chain per
 * RFC 5322 so mail clients thread the reply correctly.
 */
export async function buildReplyContext(
  gmail: gmail_v1.Gmail,
  messageId: string,
  opts: { replyAll: boolean; selfAddress: string }
): Promise<ReplyContext> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: [
      "Subject",
      "From",
      "Reply-To",
      "To",
      "Cc",
      "Message-ID",
      "References",
    ],
  });

  const headers = res.data.payload?.headers ?? [];
  const hdr = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const to = splitAddressList(hdr("Reply-To") || hdr("From"));
  const self = opts.selfAddress.toLowerCase();

  let cc: string[] = [];
  if (opts.replyAll) {
    const primary = new Set(to.map(bareAddress));
    cc = [...splitAddressList(hdr("To")), ...splitAddressList(hdr("Cc"))].filter(
      (a) => bareAddress(a) !== self && !primary.has(bareAddress(a))
    );
  }

  const subject = hdr("Subject");
  const originalMessageId = hdr("Message-ID");
  const references = [hdr("References"), originalMessageId]
    .filter(Boolean)
    .join(" ");

  return {
    to,
    cc,
    subject: /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`,
    threadId: res.data.threadId!,
    inReplyTo: originalMessageId || undefined,
    references: references || undefined,
  };
}

export async function createDraft(
  gmail: gmail_v1.Gmail,
  email: OutgoingEmail,
  reply?: ReplyContext
): Promise<CreatedDraft> {
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: buildMimeMessage(toMime(email, reply)),
        threadId: reply?.threadId,
      },
    },
  });
  return {
    draftId: res.data.id!,
    messageId: res.data.message?.id ?? "",
    threadId: res.data.message?.threadId ?? "",
    to: email.to,
    subject: email.subject,
  };
}

export async function sendDraft(
  gmail: gmail_v1.Gmail,
  draftId: string
): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  const res = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftId },
  });
  return {
    id: res.data.id!,
    threadId: res.data.threadId!,
    labelIds: res.data.labelIds ?? [],
  };
}

export async function listDrafts(
  gmail: gmail_v1.Gmail,
  query?: string,
  maxResults: number = 20
): Promise<DraftSummary[]> {
  const res = await gmail.users.drafts.list({
    userId: "me",
    q: query || undefined,
    maxResults: Math.min(maxResults, 100),
  });

  const drafts = res.data.drafts ?? [];
  if (drafts.length === 0) return [];

  const summaries: DraftSummary[] = [];
  for (let i = 0; i < drafts.length; i += DRAFT_CONCURRENCY) {
    const chunk = drafts.slice(i, i + DRAFT_CONCURRENCY);
    summaries.push(
      ...(await Promise.all(chunk.map((d) => getDraftSummary(gmail, d.id!))))
    );
  }
  return summaries;
}

async function getDraftSummary(
  gmail: gmail_v1.Gmail,
  draftId: string
): Promise<DraftSummary> {
  const res = await gmail.users.drafts.get({
    userId: "me",
    id: draftId,
    format: "metadata",
  });

  const message = res.data.message;
  const headers = message?.payload?.headers ?? [];
  const hdr = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    draftId: res.data.id!,
    messageId: message?.id ?? "",
    threadId: message?.threadId ?? "",
    to: hdr("To"),
    subject: hdr("Subject"),
    snippet: message?.snippet ?? "",
    date: hdr("Date"),
  };
}
