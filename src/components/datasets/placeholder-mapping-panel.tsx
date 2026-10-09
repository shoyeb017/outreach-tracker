"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Braces, CheckCircle2, LoaderCircle, Save, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dataPlaceholdersForTemplates, templatePlaceholders, templatesUsedByDataset } from "@/lib/templates/dataset-mapping";
import type { DatasetRow, DatasetColumn, DatasetPlaceholderMapping, EmailTemplate, RoutingRule } from "@/types";

const aliases: Record<string, string[]> = {
  recipient_email: ["email", "email_address", "contact_email", "work_email", "business_email"],
  recipient_name: ["name", "full_name", "contact", "contact_name", "person_name"],
  first_name: ["firstname", "given_name", "contact_first_name"],
  last_name: ["lastname", "surname", "family_name", "contact_last_name"],
  company_name: ["company", "organization", "organisation", "business_name", "account_name"],
  company_email: ["business_email", "organization_email", "organisation_email"],
  industry: ["category", "sector", "main_industry", "industry_category"],
  business_type: ["company_type", "customer_type", "organization_type"],
  phone: ["phone_number", "telephone", "contact_phone", "mobile"],
  website: ["site", "url", "company_website", "web_address"],
  location: ["city", "address", "region", "country"],
};

function suggestedColumn(placeholder: string, columns: DatasetColumn[], routingColumnId?: string | null) {
  if (placeholder === "industry" && routingColumnId) return routingColumnId;
  const candidates = new Set([placeholder, ...(aliases[placeholder] ?? [])]);
  return columns.find((column) => column.standard_field === placeholder || candidates.has(column.placeholder_slug))?.id ?? "";
}

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not save personalization choices.";
}

export function PlaceholderMappingPanel({ datasetId, routingColumnId, columns, templates, rules, fallbackTemplateId, initialMappings, sampleRows, subjectStrategy = "spreadsheet_fallback", onContinue, onDirtyChange }: {
  datasetId: string;
  routingColumnId?: string | null;
  columns: DatasetColumn[];
  templates: EmailTemplate[];
  rules: RoutingRule[];
  fallbackTemplateId?: string | null;
  initialMappings: DatasetPlaceholderMapping[];
  sampleRows: DatasetRow[];
  subjectStrategy?: string;
  onContinue?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const usedTemplates = useMemo(() => templatesUsedByDataset(templates, rules, fallbackTemplateId), [fallbackTemplateId, rules, templates]);
  const placeholders = useMemo(() => dataPlaceholdersForTemplates(usedTemplates, subjectStrategy !== "spreadsheet"), [usedTemplates, subjectStrategy]);
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(placeholders.map((placeholder) => {
    const saved = initialMappings.find((item) => item.placeholder === placeholder)?.column_id;
    return [placeholder, saved ?? suggestedColumn(placeholder, columns, routingColumnId)];
  })));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(placeholders.every((placeholder) => initialMappings.some((mapping) => mapping.placeholder === placeholder)));
  const missing = placeholders.filter((placeholder) => !mapping[placeholder]);

  function autoMap() {
    setSaved(false); onDirtyChange?.(true);
    setMapping((current) => Object.fromEntries(placeholders.map((placeholder) => [placeholder, current[placeholder] || suggestedColumn(placeholder, columns, routingColumnId)])));
  }

  async function save() {
    if (pending) return;
    setPending(true);
    setSaved(false); onDirtyChange?.(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Sign in again before saving personalization choices.");
      const payload = placeholders.filter((placeholder) => mapping[placeholder]).map((placeholder) => ({ placeholder, column_id: mapping[placeholder] }));
      const { error } = await supabase.rpc("save_personalization", { p_dataset_id: datasetId, p_mappings: payload });
      if (error) throw error;
      setSaved(true); onDirtyChange?.(false);
      toast.success(missing.length ? `Mappings saved. ${missing.length} still need attention.` : "All template placeholders are connected.");
      router.refresh();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-6">
    <Card className="border-[var(--border)] bg-[var(--accent)]">
      <CardHeader><CardTitle>Personalize your emails</CardTitle><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">A personalization field such as {"{{company_name}}"} is replaced with a value from your spreadsheet. Choose which column supplies each field. Only {`{{signature}}`} comes from Settings; it needs no spreadsheet column.</p></CardHeader>
      <CardContent className="flex flex-wrap gap-2">{usedTemplates.map((template) => <Badge key={template.id} tone="info">{template.name}</Badge>)}{!usedTemplates.length && <p className="text-sm text-[var(--muted-foreground)]">No templates are selected yet. Complete Choose email templates first.</p>}</CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4"><div><CardTitle>Personalization fields</CardTitle><div className="mt-2 flex gap-2"><Badge tone={missing.length ? "warning" : "success"}>{placeholders.length - missing.length} of {placeholders.length} connected</Badge>{missing.length > 0 && <Badge tone="danger">{missing.length} missing</Badge>}</div></div><Button variant="outline" onClick={autoMap} disabled={pending || !placeholders.length}><WandSparkles size={14} />Suggest matches</Button></CardHeader>
      <CardContent>
        {placeholders.length ? <div className="divide-y rounded-lg border">{placeholders.map((placeholder) => {
          const usedBy = usedTemplates.filter((template) => templatePlaceholders(template).includes(placeholder));
          const column = columns.find((item) => item.id === mapping[placeholder]);
          const example = column ? sampleRows.map((row) => row.data[column.placeholder_slug]).find((value) => value != null && String(value).trim()) : null;
          return <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1.2fr] md:items-center" key={placeholder}>
            <div><div className="flex items-center gap-2"><Braces size={15} className="text-[var(--primary)]" /><code className="font-semibold text-[var(--primary)]">{`{{${placeholder}}}`}</code>{!mapping[placeholder] && <Badge tone="danger">Required</Badge>}</div><p className="mt-1 text-xs text-[var(--muted-foreground)]">{placeholder.replaceAll("_", " ")} · Used by {usedBy.map((template) => template.name).join(", ")}</p></div>
            <div><Select aria-label={`Spreadsheet column for ${placeholder}`} value={mapping[placeholder] ?? ""} disabled={pending} onChange={(event) => { setMapping((current) => ({ ...current, [placeholder]: event.target.value })); setSaved(false); onDirtyChange?.(true); }}><option value="">Choose spreadsheet column</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select>{mapping[placeholder] && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{`{{${placeholder}}}`} will use values from <strong>{columns.find((column) => column.id === mapping[placeholder])?.original_label}</strong>.</p>}{column && <p className="mt-2 rounded-lg bg-[var(--surface-hover)] p-2 text-xs">Example: <strong>{example == null ? "No value in the sample rows — check Recipients" : String(example)}</strong></p>}</div>
          </div>;
        })}</div> : <div className="rounded-lg border border-dashed py-12 text-left"><Braces className="mx-auto text-[var(--muted-foreground)]" size={22} /><p className="mt-3 text-sm font-semibold">No spreadsheet placeholders to map</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Select templates in Choose email templates, or the selected templates only use the optional signature.</p></div>}
        {missing.length > 0 && <div className="mt-4 flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-5 text-[var(--muted-foreground)]"><AlertTriangle className="shrink-0" size={15} />Unmapped placeholders will be shown in Review and will block affected emails until connected.</div>}
        <div className="mt-5 flex flex-col justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center"><div className="text-xs" aria-live="polite">{saved ? <span className="inline-flex items-center gap-1.5 text-[var(--primary)]"><CheckCircle2 size={14} />Personalization saved</span> : <span className="text-[var(--muted-foreground)]">Suggested choices are not saved yet. Save to continue.</span>}</div><div className="flex flex-wrap gap-2"><Button onClick={save} disabled={pending || !placeholders.length}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save personalization</Button>{onContinue && <Button variant="outline" onClick={onContinue} disabled={missing.length > 0 || !saved}>Continue to select recipients<ArrowRight size={15} /></Button>}</div></div>
      </CardContent>
    </Card>
  </div>;
}
