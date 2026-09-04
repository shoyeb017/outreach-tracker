"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Save, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { groupRoutingValues, suggestTemplate } from "@/lib/templates/routing";
import type { Dataset, DatasetColumn, EmailTemplate, RoutingRule } from "@/types";

type RuleDraft = { action: RoutingRule["action"]; templateId: string };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function RoutingPanel({ dataset, columns, templates, initialRules, routingValues, onContinue }: {
  dataset: Dataset;
  columns: DatasetColumn[];
  templates: EmailTemplate[];
  initialRules: RoutingRule[];
  routingValues: { routing_value: string; row_count: number }[];
  onContinue?: () => void;
}) {
  const router = useRouter();
  const groupedValues = useMemo(() => groupRoutingValues(routingValues), [routingValues]);
  const persistedRuleState = useMemo(() => Object.fromEntries(groupedValues.map((group) => {
    const found = initialRules.find((rule) => rule.normalized_value === group.normalized_value);
    return [group.normalized_value, { action: found?.action ?? "skip", templateId: found?.template_id ?? "" } satisfies RuleDraft];
  })), [groupedValues, initialRules]);
  const [fallback, setFallback] = useState(dataset.fallback_template_id ?? "");
  const [rules, setRules] = useState<Record<string, RuleDraft>>(persistedRuleState);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(groupedValues.some((group) => !initialRules.some((rule) => rule.normalized_value === group.normalized_value)));

  function autoMatch() {
    setSavedAt(null);
    setDirty(true);
    setRules((current) => Object.fromEntries(groupedValues.map((group) => {
      const existing = current[group.normalized_value];
      if (existing?.templateId) return [group.normalized_value, existing];
      const suggestion = suggestTemplate(group.routing_value, templates);
      return [group.normalized_value, suggestion ? { action: "template" as const, templateId: suggestion.id } : existing ?? { action: "skip" as const, templateId: "" }];
    })));
  }

  function updateRule(normalizedValue: string, patch: Partial<RuleDraft>) {
    setSavedAt(null);
    setDirty(true);
    setRules((current) => ({ ...current, [normalizedValue]: { action: current[normalizedValue]?.action ?? "skip", templateId: current[normalizedValue]?.templateId ?? "", ...patch } }));
  }

  async function saveRouting() {
    const missingTemplate = groupedValues.find((group) => rules[group.normalized_value]?.action === "template" && !rules[group.normalized_value]?.templateId);
    if (missingTemplate) return toast.error(`Choose a template for "${missingTemplate.routing_value}" or change its action to Skip.`);
    const usesFallback = groupedValues.some((group) => rules[group.normalized_value]?.action === "fallback");
    if (usesFallback && !fallback) return toast.error("Choose a fallback template before using the fallback action.");

    setPending(true);
    setSavedAt(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Sign in again before saving routing.");

      const { error: datasetError } = await supabase.from("datasets").update({ fallback_template_id: fallback || null }).eq("id", dataset.id);
      if (datasetError) throw datasetError;

      const payload = groupedValues.map((group) => {
        const route = rules[group.normalized_value] ?? { action: "skip" as const, templateId: "" };
        return {
          user_id: user.id,
          dataset_id: dataset.id,
          routing_value: group.routing_value,
          normalized_value: group.normalized_value,
          action: route.action,
          template_id: route.action === "template" ? route.templateId : null,
        };
      });

      if (payload.length) {
        const { error } = await supabase.from("routing_rules").upsert(payload, { onConflict: "dataset_id,normalized_value" });
        if (error) throw error;
      }

      const activeKeys = new Set(payload.map((rule) => rule.normalized_value));
      const staleIds = initialRules.filter((rule) => !activeKeys.has(rule.normalized_value)).map((rule) => rule.id);
      if (staleIds.length) {
        const { error } = await supabase.from("routing_rules").delete().in("id", staleIds);
        if (error) throw error;
      }

      setSavedAt(new Date());
      setDirty(false);
      toast.success(`Template routing saved for ${payload.length} ${payload.length === 1 ? "value" : "values"}.`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save template routing."));
    } finally {
      setPending(false);
    }
  }

  const mapped = groupedValues.filter((group) => rules[group.normalized_value]?.action === "template" && rules[group.normalized_value]?.templateId).length;
  const fallbackCount = groupedValues.filter((group) => rules[group.normalized_value]?.action === "fallback").length;
  const skippedCount = groupedValues.filter((group) => (rules[group.normalized_value]?.action ?? "skip") === "skip").length;
  const routingColumn = columns.find((column) => column.id === dataset.routing_column_id);

  return <div className="space-y-6">
    <Card>
      <CardHeader><CardTitle>How templates are selected</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-[#f7faf8] p-4"><div className="text-xs font-bold uppercase tracking-wide text-[#71807a]">Spreadsheet selection key</div><div className="mt-2 font-semibold">{routingColumn?.original_label || "Not selected"}</div><p className="mt-2 text-xs leading-5 text-[#68736f]">Each unique value below is matched exactly to a template Category first, then to a template Name. Change this key in Required setup.</p></div>
        <div><Label>Fallback template (optional)</Label><Select value={fallback} onChange={(event) => { setFallback(event.target.value); setSavedAt(null); setDirty(true); }} disabled={pending}><option value="">No fallback - safest default</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div><CardTitle>Routing map</CardTitle><div className="mt-2 flex flex-wrap gap-2"><Badge tone="success">Direct template: {mapped}</Badge><Badge tone={fallbackCount ? "info" : "neutral"}>Fallback: {fallbackCount}</Badge><Badge tone={skippedCount ? "warning" : "success"}>Skipped: {skippedCount}</Badge></div></div>
        <Button variant="outline" onClick={autoMatch} disabled={pending}><WandSparkles size={14} />Exact auto-match</Button>
      </CardHeader>
      <CardContent>
        {groupedValues.length ? <div className="divide-y rounded-lg border">{groupedValues.map((group) => <div className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_90px_170px_1fr] md:items-center" key={group.normalized_value}>
          <div><div className="text-sm font-semibold">{group.routing_value}</div>{group.aliases.length > 1 && <div className="mt-1 text-xs text-[#8a6a24]">Combined {group.aliases.length} equivalent spellings</div>}</div>
          <div className="text-xs text-[#7a8581]">{group.row_count} rows</div>
          <Select disabled={pending} value={rules[group.normalized_value]?.action ?? "skip"} onChange={(event) => updateRule(group.normalized_value, { action: event.target.value as RoutingRule["action"] })}><option value="template">Use template</option><option value="fallback">Use fallback</option><option value="skip">Skip</option></Select>
          <Select disabled={pending || rules[group.normalized_value]?.action !== "template"} value={rules[group.normalized_value]?.templateId ?? ""} onChange={(event) => updateRule(group.normalized_value, { action: "template", templateId: event.target.value })}><option value="">Choose template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select>
        </div>)}</div> : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-[#7a8581]">No non-empty values were found in the selected template key column.</div>}
        <div className="mt-5 flex flex-col items-end justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-[#68736f]" aria-live="polite">{savedAt && <span className="inline-flex items-center gap-1.5 text-[#176b55]"><CheckCircle2 size={14} />Saved at {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          <div className="flex gap-2"><Button onClick={() => void saveRouting()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save routing</Button>{onContinue && <Button variant="outline" onClick={onContinue} disabled={dirty || pending}>Continue to placeholders</Button>}</div>
        </div>
      </CardContent>
    </Card>
  </div>;
}
