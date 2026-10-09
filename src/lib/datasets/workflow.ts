import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, EmailTemplate, RoutingRule } from "@/types";
import { dataPlaceholdersForTemplates, templatesUsedByDataset } from "@/lib/templates/dataset-mapping";
import { groupRoutingValues } from "@/lib/templates/routing";

export const datasetSteps = [
  { key: "required setup", label: "Email setup", description: "Choose the address column and how messages are assigned." },
  { key: "template routing", label: "Choose templates", description: "Confirm the message each recipient group will receive." },
  { key: "placeholder mapping", label: "Personalize", description: "Connect email fields to your spreadsheet columns." },
  { key: "recipients", label: "Select recipients", description: "Check the rows, preview emails, and select who to contact." },
  { key: "send", label: "Review & send", description: "Check the final emails and confirm a practice or real send." },
] as const;
export type DatasetStep = typeof datasetSteps[number]["key"];

export function datasetWorkflowState(args: {
  dataset: Dataset; columns: DatasetColumn[]; templates: EmailTemplate[]; rules: RoutingRule[];
  placeholderMappings: DatasetPlaceholderMapping[]; routingValues: { routing_value: string; row_count: number }[];
  selectedCount: number;
}) {
  const activeIds = new Set(args.templates.filter((template) => template.is_active && !template.is_archived).map((template) => template.id));
  const validDefault = !!args.dataset.fallback_template_id && activeIds.has(args.dataset.fallback_template_id);
  const hasRouting = !!args.dataset.routing_column_id && args.columns.some((column) => column.id === args.dataset.routing_column_id);
  const setup = args.columns.some((column) => column.standard_field === "recipient_email") && (hasRouting || validDefault);
  const templates = setup && (hasRouting ? groupRoutingValues(args.routingValues).every((group) => {
    const rule = args.rules.find((entry) => entry.normalized_value === group.normalized_value);
    return !!rule && (rule.action === "skip" || (rule.action === "fallback" && validDefault) || (rule.action === "template" && !!rule.template_id && activeIds.has(rule.template_id)));
  }) : validDefault);
  const usedTemplates = templatesUsedByDataset(args.templates, hasRouting ? args.rules : [], args.dataset.fallback_template_id);
  const fields = dataPlaceholdersForTemplates(usedTemplates, args.dataset.subject_strategy !== "spreadsheet");
  const connected = fields.filter((field) => args.placeholderMappings.some((mapping) => mapping.placeholder === field && args.columns.some((column) => column.id === mapping.column_id))).length;
  const personalized = templates && connected === fields.length;
  const selected = args.selectedCount > 0;
  const complete = [setup, templates, personalized, personalized && selected, false];
  const recommended = datasetSteps[complete.findIndex((done) => !done)].key;
  return { setup, templates, personalized, selected, complete, recommended, fields, connected, usedTemplates };
}

export function initialDatasetStep(tab: string | undefined, recommended: DatasetStep): DatasetStep {
  return datasetSteps.find((step) => step.key.replaceAll(" ", "-") === tab)?.key ?? recommended;
}
