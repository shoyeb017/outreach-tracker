"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AtSign, CheckCircle2, LoaderCircle, Save, Split } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dataset, DatasetColumn } from "@/types";

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not save the required spreadsheet setup.";
}

export function DatasetSetupPanel({ dataset, columns, onContinue }: { dataset: Dataset; columns: DatasetColumn[]; onContinue?: () => void }) {
  const router = useRouter();
  const [emailColumnId, setEmailColumnId] = useState(columns.find((column) => column.standard_field === "recipient_email")?.id ?? "");
  const [routingColumnId, setRoutingColumnId] = useState(dataset.routing_column_id ?? "");
  const [subjectColumnId, setSubjectColumnId] = useState(columns.find((column) => column.standard_field === "subject")?.id ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(Boolean(columns.some((column) => column.standard_field === "recipient_email") && dataset.routing_column_id));

  async function save() {
    if (!emailColumnId) return toast.error("Choose the spreadsheet column containing recipient email addresses.");
    if (!routingColumnId) return toast.error("Choose the spreadsheet column whose values select templates.");
    setPending(true);
    setSaved(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const currentSubject = columns.find((column) => column.standard_field === "subject");
      const emailResult = await supabase.rpc("set_dataset_standard_mapping", { p_dataset_id: dataset.id, p_column_id: emailColumnId, p_standard_field: "recipient_email" });
      if (emailResult.error) throw emailResult.error;
      if (subjectColumnId) {
        const subjectResult = await supabase.rpc("set_dataset_standard_mapping", { p_dataset_id: dataset.id, p_column_id: subjectColumnId, p_standard_field: "subject" });
        if (subjectResult.error) throw subjectResult.error;
      } else if (currentSubject) {
        const subjectResult = await supabase.rpc("set_dataset_standard_mapping", { p_dataset_id: dataset.id, p_column_id: currentSubject.id, p_standard_field: null });
        if (subjectResult.error) throw subjectResult.error;
      }
      const routingResult = await supabase.rpc("set_dataset_routing_column", { p_dataset_id: dataset.id, p_column_id: routingColumnId });
      if (routingResult.error) throw routingResult.error;
      setSaved(true);
      toast.success("Required spreadsheet columns saved and row data refreshed.");
      router.refresh();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-6">
    <Card className="border-[#cfe2da] bg-[#f5faf8]">
      <CardHeader><CardTitle>Start here: choose two required spreadsheet columns</CardTitle><p className="mt-1 text-sm leading-6 text-[#5f6f69]">These selections control where each message goes and which template it uses. They do not fill placeholders; placeholder mapping comes after template routing.</p></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8f3ee] text-[#176b55]"><AtSign size={17} /></span><div className="mt-3 text-sm font-semibold">1. Recipient email column</div><p className="mt-1 text-xs leading-5 text-[#68736f]">The value in this column becomes the email <strong>To</strong> address and is validated before sending.</p></div>
        <div className="rounded-xl border bg-white p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8f3ee] text-[#176b55]"><Split size={17} /></span><div className="mt-3 text-sm font-semibold">2. Template selection key</div><p className="mt-1 text-xs leading-5 text-[#68736f]">Each unique value is matched exactly against a template <strong>Category</strong> first and then its <strong>Name</strong>. You confirm every match in Template routing.</p></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Required spreadsheet setup</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div><Label>Spreadsheet column containing recipient email (required)</Label><Select value={emailColumnId} onChange={(event) => { setEmailColumnId(event.target.value); setSaved(false); }} disabled={pending}><option value="">Choose the email column</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select><p className="mt-2 text-xs text-[#68736f]">Example: Email Address, Work Email, Contact Email, or Recipient Email.</p></div>
        <div><Label>Spreadsheet column/key that selects the template (required)</Label><Select value={routingColumnId} onChange={(event) => { setRoutingColumnId(event.target.value); setSaved(false); }} disabled={pending}><option value="">Choose the template selection key</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select><p className="mt-2 text-xs text-[#68736f]">For your 23 templates, choose the spreadsheet column containing values such as Financial Services &amp; Banking, Insurance, or Healthcare &amp; Life Sciences.</p></div>
        <div><Label>Spreadsheet email-subject column (optional)</Label><Select value={subjectColumnId} onChange={(event) => { setSubjectColumnId(event.target.value); setSaved(false); }} disabled={pending}><option value="">Use each template subject</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.original_label}</option>)}</Select></div>
        <div className="flex flex-col justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center"><div className="text-xs" aria-live="polite">{saved ? <span className="inline-flex items-center gap-1.5 text-[#176b55]"><CheckCircle2 size={14} />Required setup saved</span> : <span className="text-[#7a8581]">Save both required columns before routing.</span>}</div><div className="flex gap-2"><Button onClick={save} disabled={pending || !emailColumnId || !routingColumnId}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save required setup</Button>{onContinue && <Button variant="outline" onClick={onContinue} disabled={!saved}>Continue to routing<ArrowRight size={15} /></Button>}</div></div>
      </CardContent>
    </Card>
  </div>;
}
