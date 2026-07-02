import { gmail_v1 } from "googleapis";
import type { EmailSummary } from "./types.js";

// ---------------------------------------------------------------------------
// batch_trash — resolve targets (query or explicit IDs), enforce the cap,
// preview on dry_run, then trash via batchModify with a per-message fallback.
// ---------------------------------------------------------------------------

const PREVIEW_CONCURRENCY = 10;

export interface BatchTrashRequest {
  query?: string;
  messageIds?: string[];
  max: number;
  dryRun: boolean;
}

export interface BatchTrashResult {
  dry_run: boolean;
  count: number;
  emails: Array<{ id: string; subject?: string; from?: string }>;
}

export async function batchTrash(
  gmail: gmail_v1.Gmail,
  req: BatchTrashRequest,
  summarize: (id: string) => Promise<EmailSummary>
): Promise<BatchTrashResult> {
  const { query, messageIds, max, dryRun } = req;

  if (!query === !messageIds) {
    throw new Error(
      "Provide exactly one of 'query' or 'message_ids' — not both, not neither."
    );
  }

  let ids: string[];
  if (query) {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(max + 1, 500),
    });
    ids = (res.data.messages ?? []).map((m) => m.id!);
    if (ids.length > max || res.data.nextPageToken) {
      throw new Error(
        `Refused: the query matches more than max=${max} messages. ` +
          "Raise 'max' explicitly or narrow the query. Nothing was trashed."
      );
    }
  } else {
    ids = messageIds!;
    if (ids.length > max) {
      throw new Error(
        `Refused: ${ids.length} message_ids exceeds max=${max}. ` +
          "Raise 'max' explicitly. Nothing was trashed."
      );
    }
  }

  if (ids.length === 0) {
    return { dry_run: dryRun, count: 0, emails: [] };
  }

  if (dryRun) {
    const summaries: EmailSummary[] = [];
    for (let i = 0; i < ids.length; i += PREVIEW_CONCURRENCY) {
      const chunk = ids.slice(i, i + PREVIEW_CONCURRENCY);
      summaries.push(...(await Promise.all(chunk.map(summarize))));
    }
    return {
      dry_run: true,
      count: ids.length,
      emails: summaries.map((s) => ({
        id: s.id,
        subject: s.subject,
        from: s.from,
      })),
    };
  }

  try {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids, addLabelIds: ["TRASH"] },
    });
  } catch {
    // batchModify can be unavailable on some delegated setups — trash singly
    for (const id of ids) {
      await gmail.users.messages.trash({ userId: "me", id });
    }
  }

  return { dry_run: false, count: ids.length, emails: ids.map((id) => ({ id })) };
}
