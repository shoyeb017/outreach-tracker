import type { EmailTemplate } from "@/types";
import { normalizeEmail } from "@/lib/validation/email";

export function isSuppressed(email: unknown, suppressionEmails: string[]) {
  const normalized = normalizeEmail(email);
  return suppressionEmails.some((item) => normalizeEmail(item) === normalized);
}

export function isDuplicateSend(args: {
  email: unknown;
  templateId: string;
  runItems?: { recipient_email: string; template_id: string }[];
  history?: { recipient_email: string; template_id: string | null; status: string }[];
  policy: "warn" | "block_template_recipient" | "allow";
}): { duplicate: boolean; blocked: boolean; scope?: "run" | "history" } {
  const email = normalizeEmail(args.email);
  const inCurrentRun = args.runItems?.some((item) => normalizeEmail(item.recipient_email) === email && item.template_id === args.templateId) ?? false;
  if (inCurrentRun) return { duplicate: true, blocked: args.policy === "block_template_recipient", scope: "run" };
  const historical = args.history?.some((item) => normalizeEmail(item.recipient_email) === email && item.template_id === args.templateId && item.status === "sent") ?? false;
  if (!historical) return { duplicate: false, blocked: false };
  return { duplicate: true, blocked: args.policy === "block_template_recipient", scope: "history" };
}

export function activeTemplates(templates: EmailTemplate[]) {
  return templates.filter((template) => template.is_active && !template.is_archived);
}
