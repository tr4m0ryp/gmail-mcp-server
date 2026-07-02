import { gmail_v1 } from "googleapis";

// ---------------------------------------------------------------------------
// Label helpers — name-based lookup (case-insensitive), creation on demand.
// ---------------------------------------------------------------------------

export interface LabelInfo {
  id: string;
  name: string;
  type: string;
}

/** Gmail's built-in labels, addressable by their fixed uppercase IDs. */
export const SYSTEM_LABELS = new Set([
  "INBOX",
  "UNREAD",
  "SPAM",
  "TRASH",
  "STARRED",
  "IMPORTANT",
]);

export async function listLabels(gmail: gmail_v1.Gmail): Promise<LabelInfo[]> {
  const res = await gmail.users.labels.list({ userId: "me" });
  return (res.data.labels ?? []).map((l) => ({
    id: l.id ?? "",
    name: l.name ?? "",
    type: l.type ?? "user",
  }));
}

export async function findLabelId(
  gmail: gmail_v1.Gmail,
  labelName: string
): Promise<string | null> {
  if (SYSTEM_LABELS.has(labelName.toUpperCase())) {
    return labelName.toUpperCase();
  }
  const res = await gmail.users.labels.list({ userId: "me" });
  const match = (res.data.labels ?? []).find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );
  return match?.id ?? null;
}

export async function getOrCreateLabel(
  gmail: gmail_v1.Gmail,
  labelName: string
): Promise<string> {
  const existing = await findLabelId(gmail, labelName);
  if (existing) return existing;

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return created.data.id!;
}
