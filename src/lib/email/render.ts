import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, DatasetRow, EmailTemplate, RoutingRule, SignatureField } from "@/types";
import { renderPlainTextSignature, renderSignature } from "./signature";
import { resolveSubject } from "./subject";
import { buildTemplateContext, extractPlaceholders, htmlToPlainText, resolvePlaceholders, sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { resolveTemplateForRow } from "@/lib/templates/routing";
import { engagementButton, engagementPlainText, engagementSettings, type EngagementSettings } from "@/lib/engagement/core";

export interface PreparedEmail {
  template: EmailTemplate | null;
  bodySource?: "template" | "spreadsheet";
  contentKey?: string | null;
  contentLabel?: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  missing: string[];
  routeSource: "override" | "routing" | "fallback" | "skip" | "unmapped" | "spreadsheet";
  requiredFields: string[];
}

export function missingEmailLabels(fields: string[]) {
  return fields.map(field => field === "email_body" ? "email body cell" : field === "email_subject" ? "subject cell" : "{{" + field + "}}").join(", ");
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
  dataset: Pick<Dataset, "fallback_template_id" | "subject_strategy"> & Partial<Pick<Dataset, "id" | "routing_column_id" | "body_source" | "body_column_id" | "spreadsheet_signature">>;
  columns: (Pick<DatasetColumn, "id" | "placeholder_slug" | "standard_field"> & Partial<Pick<DatasetColumn, "original_label">>)[];
  placeholderMappings?: Pick<DatasetPlaceholderMapping, "placeholder" | "column_id">[];
  templates: EmailTemplate[];
  rules: RoutingRule[];
  signatureFields?: SignatureField[];
  engagement?: Partial<EngagementSettings> | null;
}): PreparedEmail {
  const spreadsheet = args.dataset.body_source === "spreadsheet";
  const bodyColumn = args.columns.find(column => column.id === args.dataset.body_column_id);
  const cell = bodyColumn ? String(args.row.data[bodyColumn.placeholder_slug] ?? "") : "";
  // Spreadsheet content is plain text, never executable HTML. Keep line breaks.
  const escapedCell = cell.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!).replace(/\r?\n/g, "<br>");
  const route = resolveTemplateForRow({ overrideTemplateId: args.row.template_override_id, routingValue: args.row.routing_value, rules: args.dataset.routing_column_id === null ? [] : args.rules, fallbackTemplateId: args.dataset.fallback_template_id });
  const routedTemplate = args.templates.find((item) => item.id === route.templateId && item.is_active && !item.is_archived) ?? null;
  const template = spreadsheet ? null : routedTemplate;
  // Both sources share rendering/signature rules, but spreadsheet messages are
  // not saved as templates and never receive a fabricated template ID.
  const content: Pick<EmailTemplate, "subject_template" | "html_body" | "plain_text_body" | "signature_behavior"> | null = spreadsheet ? {
    subject_template: "", html_body: "<div>" + escapedCell + "</div>", plain_text_body: cell,
    signature_behavior: args.dataset.spreadsheet_signature === false ? "none" : "append",
  } : template;
  if (!content) return { template: null, subject: "", htmlBody: "", plainTextBody: "", missing: [], requiredFields: [], routeSource: route.source };
  const signature = content.signature_behavior === "none" ? "" : renderSignature(args.signatureFields ?? []);
  const hasSignatureToken = extractPlaceholders(content.html_body).includes("signature");
  const engagement = engagementSettings(args.engagement);
  const marker = "<!--autmail-signature-boundary-->";
  const renderedSignature = engagement.enabled && content.signature_behavior !== "none" ? marker + signature : signature;
  const context = buildTemplateContext({ rowData: rowTemplateData(args.row, args.columns, args.placeholderMappings), signatureHtml: renderedSignature });
  const resolvedSubject = resolvePlaceholders(content.subject_template, context);
  const resolvedBody = resolvePlaceholders(normalizeSignatureTokenBlocks(content.html_body), context, true);
  let htmlBody = resolvedBody.output;
  if (content.signature_behavior === "append" && !hasSignatureToken) htmlBody += renderedSignature;
  if (content.signature_behavior === "none" && signature) htmlBody = htmlBody.replace(signature, "");
  const subject = resolveSubject(spreadsheet ? "spreadsheet" : args.dataset.subject_strategy, args.row.subject_value, resolvedSubject.output);
  const plainSignature = content.signature_behavior === "none" ? "" : renderPlainTextSignature(args.signatureFields);
  const plainContext = { ...context, signature: engagement.enabled && content.signature_behavior !== "none" ? marker + plainSignature : plainSignature };
  const resolvedPlain = content.plain_text_body ? resolvePlaceholders(content.plain_text_body, plainContext) : null;
  let plainTextBody = resolvedPlain?.output ?? htmlToPlainText(htmlBody);
  if (resolvedPlain && content.signature_behavior === "append" && !extractPlaceholders(content.plain_text_body ?? "").includes("signature")) plainTextBody += "\n\n" + plainContext.signature;
  if (engagement.enabled) {
    htmlBody = insertEngagement(htmlBody, marker, signature, engagementButton(engagement), engagement.placement, true);
    // A plain body generated from HTML already contains the button text; build it from the final HTML instead.
    plainTextBody = resolvedPlain ? insertEngagement(plainTextBody, marker, plainSignature, engagementPlainText(engagement), engagement.placement, false) : htmlToPlainText(htmlBody.replace(/(<a\b[^>]*href="https:\/\/autmail\.invalid\/engagement-preview"[^>]*>)([\s\S]*?)(<\/a>)/i, "$1$2 (https://autmail.invalid/engagement-preview)$3"));
  }
  htmlBody = htmlBody.replaceAll(marker, ""); plainTextBody = plainTextBody.replaceAll(marker, "");
  const usesTemplateSubject = !spreadsheet && (args.dataset.subject_strategy === "template" || (args.dataset.subject_strategy === "spreadsheet_fallback" && !args.row.subject_value?.trim()));
  const missing = Array.from(new Set([...(usesTemplateSubject ? resolvedSubject.missing : []), ...resolvedBody.missing, ...(resolvedPlain?.missing ?? [])]));
  if (!subject.trim()) missing.push("email_subject");
  if (!htmlToPlainText(htmlBody).trim() && !/<img\b/i.test(htmlBody)) missing.push("email_body");
  if (spreadsheet && (!bodyColumn || !cell.trim())) missing.push("email_body");
  const requiredFields = spreadsheet ? [] : Array.from(new Set([...(usesTemplateSubject ? extractPlaceholders(content.subject_template) : []), ...extractPlaceholders(content.html_body), ...extractPlaceholders(content.plain_text_body ?? "")])).filter((field) => field !== "signature");
  return { template, bodySource: spreadsheet ? "spreadsheet" : "template",
    contentKey: spreadsheet ? (args.dataset.id ? "spreadsheet:" + args.dataset.id : null) : template?.id ?? null,
    contentLabel: spreadsheet ? "Spreadsheet body" + (bodyColumn?.original_label ? ": " + bodyColumn.original_label : "") : template?.name ?? "Email template",
    subject, htmlBody: sanitizeEmailHtml(htmlBody), plainTextBody, missing: [...new Set(missing)], requiredFields, routeSource: spreadsheet ? "spreadsheet" : route.source };
}

function insertEngagement(body: string, marker: string, signature: string, button: string, placement: EngagementSettings["placement"], html: boolean) {
  const index = body.indexOf(marker);
  if (index < 0) return body + (html ? "" : "\n\n") + button;
  const before = body.slice(0, index), after = body.slice(index + marker.length);
  if (placement === "after_signature") return before + after.slice(0, signature.length) + (html ? "" : "\n\n") + button + after.slice(signature.length);
  // Old ready-made templates keep their closing in a separate paragraph. Keep that closing with the signature.
  const paragraph = before.toLowerCase().lastIndexOf("<p");
  const candidate = html && paragraph >= 0 ? before.slice(paragraph) : "";
  const richClosing = /^<p\b[^>]*>[\s\S]*<\/p>\s*$/i.test(candidate) && /^(?:best regards|kind regards|regards|sincerely|best wishes)[,.!]?$/i.test(candidate.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").trim());
  const plainClosing = !html ? before.match(/(?:^|\n)(?:best regards|kind regards|regards|sincerely|best wishes)[,.!]?\s*$/i) : null;
  const closingIndex = richClosing ? paragraph : plainClosing?.index ?? before.length;
  const closing = before.slice(closingIndex);
  return before.slice(0, closingIndex) + button + (html ? "" : "\n\n") + closing + after;
}
