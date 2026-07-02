import { gmail_v1 } from "googleapis";
import { findLabelId, getOrCreateLabel, SYSTEM_LABELS } from "./labels.js";

// ---------------------------------------------------------------------------
// Filter creation — label names resolved (and created, for additions) before
// the filter is stored. Requires the gmail.settings.basic scope.
// ---------------------------------------------------------------------------

export interface FilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
}

export interface FilterAction {
  addLabels?: string[];
  removeLabels?: string[];
  shouldTrash?: boolean;
}

export interface CreatedFilter {
  filter_id: string;
  criteria: Record<string, string>;
  add_label_ids: string[];
  remove_label_ids: string[];
}

export async function createFilter(
  gmail: gmail_v1.Gmail,
  criteria: FilterCriteria,
  action: FilterAction
): Promise<CreatedFilter> {
  if (!criteria.from && !criteria.to && !criteria.subject && !criteria.query) {
    throw new Error(
      "Filter criteria must include at least one of: from, to, subject, query."
    );
  }

  const addLabelIds: string[] = [];
  for (const name of action.addLabels ?? []) {
    addLabelIds.push(
      SYSTEM_LABELS.has(name.toUpperCase())
        ? name.toUpperCase()
        : await getOrCreateLabel(gmail, name)
    );
  }
  if (action.shouldTrash && !addLabelIds.includes("TRASH")) {
    addLabelIds.push("TRASH");
  }

  const removeLabelIds: string[] = [];
  for (const name of action.removeLabels ?? []) {
    const id = await findLabelId(gmail, name);
    if (!id) {
      throw new Error(
        `Label "${name}" does not exist, so a filter cannot remove it.`
      );
    }
    removeLabelIds.push(id);
  }

  if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
    throw new Error(
      "Filter action must add or remove at least one label, or set should_trash."
    );
  }

  const res = await gmail.users.settings.filters.create({
    userId: "me",
    requestBody: {
      criteria: {
        from: criteria.from,
        to: criteria.to,
        subject: criteria.subject,
        query: criteria.query,
      },
      action: {
        addLabelIds: addLabelIds.length > 0 ? addLabelIds : undefined,
        removeLabelIds: removeLabelIds.length > 0 ? removeLabelIds : undefined,
      },
    },
  });

  const stored = res.data;
  return {
    filter_id: stored.id ?? "",
    criteria: Object.fromEntries(
      Object.entries(stored.criteria ?? {}).filter(([, v]) => v != null)
    ) as Record<string, string>,
    add_label_ids: stored.action?.addLabelIds ?? [],
    remove_label_ids: stored.action?.removeLabelIds ?? [],
  };
}
