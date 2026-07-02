export interface EmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

export interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
  headers: Record<string, string>;
  unsubscribeLinks: string[];
}

export interface UnsubscribeResult {
  success: boolean;
  method: "header-mailto" | "header-http" | "body-link" | "none";
  detail: string;
}
