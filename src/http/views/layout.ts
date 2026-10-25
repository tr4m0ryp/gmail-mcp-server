import { escapeHtml } from "../html.js";
import { icon } from "./icons.js";
import { PAGE_CSS } from "./styles/index.js";

// ---------------------------------------------------------------------------
// Page shell — self-contained document: inline CSS, optional inline script,
// system fonts only, no external requests.
// ---------------------------------------------------------------------------

export interface PageOptions {
  title: string;
  body: string;
  script?: string;
}

export function renderPage({ title, body, script }: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
${body}
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

/** Product mark: envelope glyph on an ink tile. */
export function brandMark(): string {
  return `<div class="mark">${icon("mail")}</div>`;
}
