// ---------------------------------------------------------------------------
// Unsubscribe link discovery — List-Unsubscribe headers and body scanning.
// ---------------------------------------------------------------------------

/** Case-insensitive header lookup (senders vary the casing of List-Unsubscribe). */
export function findHeader(
  headers: Record<string, string>,
  name: string
): string {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return "";
}

export function extractHttpLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/[^>,\s<]+/gi);
  return matches ?? [];
}

export function extractUnsubscribeLinksFromBody(body: string): string[] {
  const links: string[] = [];
  // Match href links near "unsubscribe" text
  const hrefPattern =
    /href\s*=\s*["']?(https?:\/\/[^"'\s>]+(?:unsubscribe|opt.?out|remove|manage.?preferences)[^"'\s>]*)["']?/gi;
  let match;
  while ((match = hrefPattern.exec(body)) !== null) {
    links.push(match[1]);
  }
  // Also match plain URLs with unsubscribe keywords
  const urlPattern =
    /(https?:\/\/\S+(?:unsubscribe|opt.?out|remove|manage.?preferences)\S*)/gi;
  while ((match = urlPattern.exec(body)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  return [...new Set(links)];
}

export function parseUnsubscribeLinks(
  headers: Record<string, string>,
  body: string
): string[] {
  const links: string[] = [];

  const listUnsub = findHeader(headers, "List-Unsubscribe");
  links.push(...extractHttpLinks(listUnsub));

  const mailtoMatch = listUnsub.match(/mailto:([^>,\s]+)/i);
  if (mailtoMatch) links.push(`mailto:${mailtoMatch[1]}`);

  links.push(...extractUnsubscribeLinksFromBody(body));

  return [...new Set(links)];
}
