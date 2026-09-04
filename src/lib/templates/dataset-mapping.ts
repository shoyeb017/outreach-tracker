import type { EmailTemplate, RoutingRule } from "@/types";
import { extractPlaceholders } from "./placeholders";

export function isSenderPlaceholder(placeholder: string) {
  return placeholder === "signature" || placeholder.startsWith("profile.");
}

export function templatePlaceholders(template: Pick<EmailTemplate, "subject_template" | "html_body" | "plain_text_body">) {
  return Array.from(new Set([
    ...extractPlaceholders(template.subject_template),
    ...extractPlaceholders(template.html_body),
    ...extractPlaceholders(template.plain_text_body ?? ""),
  ]));
}

export function templatesUsedByDataset(
  templates: EmailTemplate[],
  rules: Pick<RoutingRule, "action" | "template_id">[],
  fallbackTemplateId?: string | null,
) {
  const ids = new Set(rules.filter((rule) => rule.action === "template" && rule.template_id).map((rule) => rule.template_id!));
  if (fallbackTemplateId) ids.add(fallbackTemplateId);
  return templates.filter((template) => ids.has(template.id));
}

export function dataPlaceholdersForTemplates(templates: Pick<EmailTemplate, "subject_template" | "html_body" | "plain_text_body">[]) {
  return Array.from(new Set(templates.flatMap(templatePlaceholders))).filter((placeholder) => !isSenderPlaceholder(placeholder)).sort();
}
