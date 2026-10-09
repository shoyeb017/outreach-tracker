import { prepareRowEmail } from "./render";
import { isDuplicateSend, isSuppressed } from "./protection";
import type { UserPreferences } from "@/types";
import { isValidEmail } from "@/lib/validation/email";

export type ReadyStatus = "ready" | "missing_email" | "invalid_email" | "suppressed" | "duplicate" | "missing_template" | "missing_mapping" | "missing_placeholder" | "routing_skip" | "uncertain";
export function checkEmailReadiness(args: {
  row: Parameters<typeof prepareRowEmail>[0]["row"]; email: ReturnType<typeof prepareRowEmail>;
  mapped: Set<string>; suppressions: string[]; policy: UserPreferences["duplicate_policy"];
  batchItems?: { recipient_email: string; template_id: string }[];
  history?: { recipient_email: string; template_id: string | null; status: string }[];
  uncertain?: { recipient_email: string; template_id: string | null }[];
}): { status: ReadyStatus; note?: string; warning?: string } {
  const { row, email } = args;
  if (!row.recipient_email) return { status: "missing_email", note: "Add a recipient email address." };
  if (!row.email_valid || !isValidEmail(row.recipient_email)) return { status: "invalid_email", note: "Correct this email address in Recipients." };
  if (isSuppressed(row.recipient_email, args.suppressions)) return { status: "suppressed", note: "This address is on your do-not-send list." };
  if (email.routeSource === "skip") return { status: "routing_skip", note: "You chose to skip this spreadsheet value." };
  if (!email.template) return { status: "missing_template", note: "Choose an email template for this recipient." };
  if (args.uncertain?.some((item) => item.recipient_email.trim().toLowerCase() === row.recipient_email?.trim().toLowerCase() && item.template_id === email.template?.id)) return { status: "uncertain", note: "An earlier send to this address is unconfirmed. Check Microsoft Sent Items; it will not be automatically resent." };
  const unmapped = email.requiredFields.filter((field) => !args.mapped.has(field));
  if (unmapped.length) return { status: "missing_mapping", note: `Connect these fields to columns: ${unmapped.map((field) => "{{" + field + "}}").join(", ")}` };
  if (email.missing.length) return { status: "missing_placeholder", note: `Add values for: ${email.missing.join(", ")}` };
  const duplicate = isDuplicateSend({ email: row.recipient_email, templateId: email.template.id, runItems: args.batchItems, history: args.history, policy: args.policy });
  if (duplicate.blocked) return { status: "duplicate", note: duplicate.scope === "run" ? "Another selected row uses this email and template." : "This address has already received this template." };
  return { status: "ready", warning: duplicate.duplicate && args.policy === "warn" ? "Repeated email and template; allowed by your warning policy." : undefined };
}
