import type { EmailSummary, GmailService } from "../../gmail/index.js";
import type { AccountService } from "../accounts.js";

export interface AccountResult {
  account: string;
  emails: EmailSummary[];
  error?: string;
}

export function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/**
 * Run a query against one account or all of them. Per-account failures are
 * reported in the result (not swallowed) so the model can tell an empty
 * mailbox from a broken account.
 */
export async function collectAcrossAccounts(
  accounts: AccountService,
  account: string,
  fn: (service: GmailService) => Promise<EmailSummary[]>
): Promise<AccountResult[]> {
  const emails = accounts.resolveAccounts(account);
  const results: AccountResult[] = [];

  for (const email of emails) {
    try {
      const service = await accounts.getGmailService(email);
      results.push({ account: email, emails: await fn(service) });
    } catch (err: any) {
      results.push({
        account: email,
        emails: [],
        error: err?.message ?? String(err),
      });
    }
  }

  return results;
}
