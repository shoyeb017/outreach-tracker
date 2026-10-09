"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dataset, DatasetColumn, DatasetRow, EmailTemplate } from "@/types";

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not save the required spreadsheet setup.";
}

export function DatasetSetupPanel({ dataset, columns, templates, sampleRows = [], onContinue, onDirtyChange }: { dataset: Dataset; columns: DatasetColumn[]; templates: EmailTemplate[]; sampleRows?: DatasetRow[]; onContinue?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const router = useRouter();
  const [emailColumnId, setEmailColumnId] = useState(columns.find((column) => column.standard_field === "recipient_email")?.id ?? "");
  const [routingColumnId, setRoutingColumnId] = useState(dataset.routing_column_id ?? "");
  const [subjectColumnId, setSubjectColumnId] = useState(columns.find((column) => column.standard_field === "subject")?.id ?? "");
  const [mode, setMode] = useState(dataset.routing_column_id ? "column" : "single");
  const [templateId, setTemplateId] = useState(dataset.fallback_template_id ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(Boolean(columns.some((column) => column.standard_field === "recipient_email") && (dataset.routing_column_id || dataset.fallback_template_id)));

  async function save() {
    if (!emailColumnId) return toast.error("Choose the spreadsheet column containing recipient email addresses.");
    if (mode === "column" && !routingColumnId) return toast.error("Choose the spreadsheet column whose values select templates.");
    if (pending) return;
    if (mode === "single" && !templateId) return toast.error("Choose the email template everyone will receive.");
    setPending(true);
    setSaved(false); onDirtyChange?.(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc("save_spreadsheet_setup", { p_dataset_id: dataset.id, p_email_column: emailColumnId, p_routing_column: mode === "column" ? routingColumnId : null, p_template: mode === "single" ? templateId : dataset.fallback_template_id, p_subject_column: subjectColumnId || null });
      if (error) throw error;
      setSaved(true); onDirtyChange?.(false);
      toast.success("Email setup saved. Your recipient rows have been updated.");
      router.refresh();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setPending(false);
    }
  }

  return <Card><CardHeader><CardTitle>Email setup</CardTitle><p className="page-subtitle">Decide where emails go and which message each recipient receives.</p></CardHeader><CardContent className="space-y-5">
    <div><Label htmlFor="recipient-email-column">Which column contains the recipient email?</Label><Select id="recipient-email-column" disabled={pending} value={emailColumnId} onChange={(event) => { setEmailColumnId(event.target.value); setSaved(false); onDirtyChange?.(true); }}><option value="">Choose email column</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select><p className="mt-2 text-xs text-[var(--muted-foreground)]">Examples: {sampleRows.slice(0, 3).map((row) => String(row.data[columns.find((column) => column.id === emailColumnId)?.placeholder_slug ?? ""] || "Empty")).join(" · ") || "Choose a column to see sample values."}</p></div>
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Which email should recipients receive?</legend>{[["single", "One template for everyone"], ["column", "Different templates by spreadsheet value"]].map(([value, label]) => <label key={value} className={`rounded-xl border p-4 text-sm ${mode === value ? "border-[var(--border)] bg-[var(--muted)]" : ""}`}><input name="email-choice" type="radio" disabled={pending} checked={mode === value} onChange={() => { setMode(value); setSaved(false); onDirtyChange?.(true); }} /> {label}</label>)}</fieldset>
    {mode === "single" ? <div><Label htmlFor="everyone-email">Email template for everyone</Label><Select id="everyone-email" disabled={pending} value={templateId} onChange={(event) => { setTemplateId(event.target.value); setSaved(false); onDirtyChange?.(true); }}><option value="">Choose an email template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div> : <div><Label htmlFor="selection-column">Use this column to choose different emails</Label><Select id="selection-column" disabled={pending} value={routingColumnId} onChange={(event) => { setRoutingColumnId(event.target.value); setSaved(false); onDirtyChange?.(true); }}><option value="">Choose a column, such as Industry</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select><p className="mt-2 text-xs text-[var(--muted-foreground)]">Next, confirm which email each value receives. Changing this column clears previous assignments.</p></div>}
    <details><summary className="cursor-pointer text-sm font-semibold">Use subjects from a spreadsheet column (optional)</summary><Select aria-label="Subject column" className="mt-3" value={subjectColumnId} onChange={(event) => { setSubjectColumnId(event.target.value); setSaved(false); onDirtyChange?.(true); }}><option value="">Use template subjects</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select></details>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><span role="status" className="text-xs text-[var(--muted-foreground)]">{saved ? "Saved. Continue when ready." : "Save your choices before continuing."}</span><div className="flex flex-wrap gap-2"><Button disabled={pending || !emailColumnId || (mode === "single" ? !templateId : !routingColumnId)} onClick={save}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save choices</Button>{onContinue && <Button disabled={!saved || pending} onClick={onContinue}>Continue to templates<ArrowRight size={15} /></Button>}</div></div>
  </CardContent></Card>;
}
