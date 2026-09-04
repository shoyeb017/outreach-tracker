import type { EmailTemplate, RoutingRule } from "@/types";

export function normalizeRoutingValue(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface RoutingValueGroup {
  normalized_value: string;
  routing_value: string;
  row_count: number;
  aliases: string[];
}

export function groupRoutingValues(values: { routing_value: string; row_count: number }[]): RoutingValueGroup[] {
  const groups = new Map<string, RoutingValueGroup>();
  for (const value of values) {
    const label = String(value.routing_value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const normalized = normalizeRoutingValue(label);
    if (!normalized) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.row_count += Number(value.row_count) || 0;
      if (!existing.aliases.includes(label)) existing.aliases.push(label);
    } else {
      groups.set(normalized, { normalized_value: normalized, routing_value: label, row_count: Number(value.row_count) || 0, aliases: [label] });
    }
  }
  return Array.from(groups.values());
}

export function suggestTemplate(value: unknown, templates: Pick<EmailTemplate, "id" | "name" | "category" | "is_active" | "is_archived">[]) {
  const normalized = normalizeRoutingValue(value);
  if (!normalized) return null;
  const candidates = templates.filter((template) => template.is_active && !template.is_archived);
  return candidates.find((template) => normalizeRoutingValue(template.category) === normalized)
    ?? candidates.find((template) => normalizeRoutingValue(template.name) === normalized)
    ?? null;
}

export function resolveTemplateForRow(args: {
  overrideTemplateId?: string | null;
  routingValue?: unknown;
  rules: Pick<RoutingRule, "normalized_value" | "template_id" | "action">[];
  fallbackTemplateId?: string | null;
}) {
  if (args.overrideTemplateId) return { templateId: args.overrideTemplateId, source: "override" as const };
  const normalized = normalizeRoutingValue(args.routingValue);
  const rule = args.rules.find((entry) => entry.normalized_value === normalized);
  if (rule?.action === "skip") return { templateId: null, source: "skip" as const };
  if (rule?.action === "template" && rule.template_id) return { templateId: rule.template_id, source: "routing" as const };
  if ((rule?.action === "fallback" || !rule) && args.fallbackTemplateId) return { templateId: args.fallbackTemplateId, source: "fallback" as const };
  return { templateId: null, source: "unmapped" as const };
}
