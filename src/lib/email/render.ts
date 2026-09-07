import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, DatasetRow, EmailTemplate, RoutingRule, SignatureField } from "@/types";
import { renderSignature } from "./signature";
import { resolveSubject } from "./subject";
import { buildTemplateContext, extractPlaceholders, htmlToPlainText, resolvePlaceholders, sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { resolveTemplateForRow } from "@/lib/templates/routing";

export interface PreparedEmail {
  template: EmailTemplate | null;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  missing: string[];
  routeSource: "override" | "routing" | "fallback" | "skip" | "unmapped";
}

export function normalizeSignatureTokenBlocks(html: string) {
  return html.replace(/<p(?:\s[^>]*)?>\s*({{\s*signature\s*}})\s*<\/p>/gi, "$1");
}

function assignPlaceholder(target: Record<string, unknown>, placeholder: string, value: unknown) {
  const path = placeholder.split(".");
  if (!path.length || path.some((segment) => !segment || ["__proto__", "prototype", "constructor"].includes(segment))) return;
  let current = target;
  for (const segment of path.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[path.at(-1)!] = value;
}

export function rowTemplateData(
  row: Pick<DatasetRow, "data">,
  columns: Pick<DatasetColumn, "id" | "placeholder_slug" | "standard_field">[],
  placeholderMappings: Pick<DatasetPlaceholderMapping, "placeholder" | "column_id">[] = [],
) {
  const standard = Object.fromEntries(columns.filter((column) => column.standard_field).map((column) => [column.standard_field!, row.data[column.placeholder_slug] ?? ""]));
  const output: Record<string, unknown> = { ...row.data, ...standard, name: standard.recipient_name ?? row.data.name ?? "", email: standard.recipient_email ?? row.data.email ?? "", company: standard.company_name ?? row.data.company ?? "" };
  for (const mapping of placeholderMappings) {
    const column = columns.find((item) => item.id === mapping.column_id);
    if (column) assignPlaceholder(output, mapping.placeholder, row.data[column.placeholder_slug] ?? "");
  }
  return output;
}

export function prepareRowEmail(args: {
  row: DatasetRow;
  dataset: Pick<Dataset, "fallback_template_id" | "subject_strategy">;
  columns: Pick<DatasetColumn, "id" | "placeholder_slug" | "standard_field">[];
  placeholderMappings?: Pick<DatasetPlaceholderMapping, "placeholder" | "column_id">[];
  templates: EmailTemplate[];
  rules: RoutingRule[];
  signatureFields?: SignatureField[];
}): PreparedEmail {
  const route = resolveTemplateForRow({ overrideTemplateId: args.row.template_override_id, routingValue: args.row.routing_value, rules: args.rules, fallbackTemplateId: args.dataset.fallback_template_id });
  const template = args.templates.find((item) => item.id === route.templateId) ?? null;
  if (!template) return { template: null, subject: "", htmlBody: "", plainTextBody: "", missing: [], routeSource: route.source };
  const signature = renderSignature(args.signatureFields ?? []);
  const hasSignatureToken = extractPlaceholders(template.html_body).includes("signature");
  const context = buildTemplateContext({ rowData: rowTemplateData(args.row, args.columns, args.placeholderMappings), signatureHtml: signature });
  const resolvedSubject = resolvePlaceholders(template.subject_template, context);
  const resolvedBody = resolvePlaceholders(normalizeSignatureTokenBlocks(template.html_body), context);
  let htmlBody = resolvedBody.output;
  if (template.signature_behavior === "append" && !hasSignatureToken) htmlBody += signature;
  if (template.signature_behavior === "none" && signature) htmlBody = htmlBody.replace(signature, "");
  const subject = resolveSubject(args.dataset.subject_strategy, args.row.subject_value, resolvedSubject.output);
  const missing = Array.from(new Set([...resolvedSubject.missing, ...resolvedBody.missing]));
  return { template, subject, htmlBody: sanitizeEmailHtml(htmlBody), plainTextBody: template.plain_text_body ? resolvePlaceholders(template.plain_text_body, context).output : htmlToPlainText(htmlBody), missing, routeSource: route.source };
}
