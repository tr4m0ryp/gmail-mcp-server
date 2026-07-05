import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// MIME construction — builds RFC 2822 messages for the Gmail API `raw` field.
// Every header value is sanitized against CRLF injection; non-ASCII header
// text is RFC 2047 encoded so subjects and names survive transport intact.
// ---------------------------------------------------------------------------

export interface MimeMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  /** Optional HTML alternative — sent as multipart/alternative with the text body. */
  htmlBody?: string;
  /** Message-ID of the message being replied to (threading headers). */
  inReplyTo?: string;
  /** Full References chain for the reply, ending with inReplyTo. */
  references?: string;
}

/** Reject header values that could smuggle extra headers into the message. */
export function assertSafeHeaderValue(name: string, value: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`Invalid ${name}: header values must not contain line breaks`);
  }
  return value.trim();
}

/** RFC 2047 encoded-word for non-ASCII header text (subjects, display names). */
function encodeHeaderText(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function addressHeader(name: string, addresses: string[]): string {
  const safe = addresses.map((a) => assertSafeHeaderValue(name, a)).filter(Boolean);
  return `${name}: ${safe.join(", ")}`;
}

/** Base64 with the 76-char line wrapping MIME transports expect. */
function base64Body(content: string): string {
  return Buffer.from(content, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}

/** Build the full message and return it base64url-encoded for `raw`. */
export function buildMimeMessage(msg: MimeMessage): string {
  const headers: string[] = ["MIME-Version: 1.0"];

  if (msg.to.length > 0) headers.push(addressHeader("To", msg.to));
  if (msg.cc?.length) headers.push(addressHeader("Cc", msg.cc));
  if (msg.bcc?.length) headers.push(addressHeader("Bcc", msg.bcc));
  headers.push(
    `Subject: ${encodeHeaderText(assertSafeHeaderValue("Subject", msg.subject))}`
  );
  if (msg.inReplyTo) {
    headers.push(`In-Reply-To: ${assertSafeHeaderValue("In-Reply-To", msg.inReplyTo)}`);
  }
  if (msg.references) {
    headers.push(`References: ${assertSafeHeaderValue("References", msg.references)}`);
  }

  let body: string;
  if (msg.htmlBody) {
    const boundary = `b_${randomBytes(12).toString("hex")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(msg.textBody),
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(msg.htmlBody),
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    headers.push("Content-Transfer-Encoding: base64");
    body = base64Body(msg.textBody);
  }

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`).toString("base64url");
}

/**
 * Split an address-list header on top-level commas — commas inside quoted
 * display names ("Doe, Jane" <j@x>) do not split.
 */
export function splitAddressList(headerValue: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of headerValue) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Extract the bare email from "Name <addr>" or a bare address. */
export function bareAddress(mailbox: string): string {
  const angled = mailbox.match(/<([^>]+)>/);
  return (angled ? angled[1] : mailbox).trim().toLowerCase();
}
