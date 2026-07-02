import type { EmailDetail, UnsubscribeResult } from "./types.js";
import {
  extractHttpLinks,
  extractUnsubscribeLinksFromBody,
  findHeader,
} from "./links.js";

// ---------------------------------------------------------------------------
// Unsubscribe flow, in order of reliability:
// 1. RFC 8058 one-click POST (List-Unsubscribe-Post) — the sanctioned
//    automated method; a GET on the same URL may just be a landing page.
// 2. mailto: from List-Unsubscribe
// 3. GET on List-Unsubscribe HTTP links
// 4. GET on unsubscribe links scraped from the body
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;

export interface UnsubscribeMailer {
  sendUnsubscribeMail(toAddress: string, subject: string): Promise<void>;
}

export async function attemptUnsubscribe(
  email: EmailDetail,
  mailer: UnsubscribeMailer
): Promise<UnsubscribeResult> {
  const listUnsubscribe = findHeader(email.headers, "List-Unsubscribe");
  const httpLinks = extractHttpLinks(listUnsubscribe);

  // 1. RFC 8058 one-click POST
  const postHeader = findHeader(email.headers, "List-Unsubscribe-Post");
  if (postHeader && httpLinks.length > 0) {
    for (const link of httpLinks) {
      try {
        const resp = await fetch(link, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postHeader,
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (resp.ok) {
          return {
            success: true,
            method: "header-http",
            detail: `Successfully POSTed unsubscribe via RFC 8058: ${link}`,
          };
        }
      } catch {
        // Try next link
      }
    }
  }

  // 2. mailto from List-Unsubscribe header
  const mailtoMatch = listUnsubscribe.match(/mailto:([^>,\s]+)/i);
  if (mailtoMatch) {
    // mailto may carry a query string, e.g. mailto:a@b.com?subject=unsubscribe
    const [address, queryStr] = mailtoMatch[1].split("?");
    const subject =
      new URLSearchParams(queryStr ?? "").get("subject") ?? "Unsubscribe";
    try {
      await mailer.sendUnsubscribeMail(address, subject);
      return {
        success: true,
        method: "header-mailto",
        detail: `Sent unsubscribe email to ${address}`,
      };
    } catch {
      // Fall through
    }
  }

  // 3. GET on List-Unsubscribe HTTP links
  for (const link of httpLinks) {
    try {
      const resp = await fetch(link, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.ok) {
        return {
          success: true,
          method: "header-http",
          detail: `Successfully requested unsubscribe via header link: ${link}`,
        };
      }
    } catch {
      // Try next link
    }
  }

  // 4. Scan body for unsubscribe links
  const bodyLinks = extractUnsubscribeLinksFromBody(email.body);
  for (const link of bodyLinks) {
    try {
      const resp = await fetch(link, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.ok) {
        return {
          success: true,
          method: "body-link",
          detail: `Visited unsubscribe link found in email body: ${link}`,
        };
      }
    } catch {
      // Try next
    }
  }

  // 5. Nothing worked — return the links so the caller can inform the user
  const allLinks = [...httpLinks, ...bodyLinks];
  return {
    success: false,
    method: "none",
    detail:
      allLinks.length > 0
        ? `Could not auto-unsubscribe. Found these links the user can try manually:\n${allLinks.join("\n")}`
        : "No unsubscribe mechanism found in this email.",
  };
}
