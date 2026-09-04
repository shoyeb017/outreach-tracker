"use client";

import { useRouter } from "next/navigation";
import { Copy, Download, FileX2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { downloadBlob } from "@/lib/utils";

export function DatasetActions({ datasetId, datasetName, originalFilePath }: { datasetId: string; datasetName: string; originalFilePath?: string | null }) {
  const router = useRouter();
  async function exportDataset(format: "csv" | "xlsx") {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from("dataset_rows").select("data,email_history(status,sent_at,template_id,error_message)").eq("dataset_id", datasetId).order("row_number");
    if (error) return toast.error(error.message);
    const rows = (data ?? []).map((item) => ({ ...(item.data as Record<string, unknown>), "Send Status": item.email_history?.[0]?.status ?? "Not sent", "Last Sent": item.email_history?.[0]?.sent_at ?? "", "Template Used": item.email_history?.[0]?.template_id ?? "", "Last Error": item.email_history?.[0]?.error_message ?? "" }));
    const sheet = XLSX.utils.json_to_sheet(rows); const baseName = datasetName.replace(/[^a-z0-9-_]+/gi, "-");
    if (format === "csv") downloadBlob(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" }), `${baseName}-results.csv`);
    else { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Results"); downloadBlob(new Blob([XLSX.write(book, { type: "array", bookType: "xlsx" })]), `${baseName}-results.xlsx`); }
  }
  async function rename() { const next = window.prompt("Dataset name", datasetName)?.trim(); if (!next || next === datasetName) return; const { error } = await getSupabaseBrowserClient().from("datasets").update({ name: next }).eq("id", datasetId); if (error) toast.error(error.message); else { toast.success("Dataset renamed"); router.refresh(); } }
  async function duplicateMapping() { const profileName = window.prompt("Save this mapping as", `${datasetName} mapping`)?.trim(); if (!profileName) return; const supabase = getSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const [dataset, columns, rules] = await Promise.all([supabase.from("datasets").select("subject_strategy,routing_column_id").eq("id", datasetId).single(), supabase.from("dataset_columns").select("id,original_label,standard_field").eq("dataset_id", datasetId), supabase.from("routing_rules").select("routing_value,action,template_id").eq("dataset_id", datasetId)]); const error = dataset.error || columns.error || rules.error; if (error) return toast.error(error.message); const routing = columns.data?.find((column) => column.id === dataset.data.routing_column_id); const mappings = Object.fromEntries((columns.data ?? []).filter((column) => column.standard_field).map((column) => [column.standard_field!, column.original_label])); const routingRules = Object.fromEntries((rules.data ?? []).map((rule) => [rule.routing_value, { action: rule.action, templateId: rule.template_id ?? "" }])); const { error: saveError } = await supabase.from("column_mapping_profiles").upsert({ user_id: user.id, name: profileName, source_columns: (columns.data ?? []).map((column) => column.original_label), mappings, routing_key_label: routing?.original_label ?? null, routing_rules: routingRules, subject_strategy: dataset.data.subject_strategy }, { onConflict: "user_id,name" }); if (saveError) toast.error(saveError.message); else toast.success("Reusable mapping saved."); }
  async function deleteOriginal() { const supabase = getSupabaseBrowserClient(); const { data, error } = await supabase.from("datasets").select("original_file_path").eq("id", datasetId).single(); if (error) return toast.error(error.message); if (!data.original_file_path) return toast.info("No original file is retained for this dataset."); if (!window.confirm("Delete the retained source spreadsheet? Imported rows will remain.")) return; const { error: storageError } = await supabase.storage.from("imports").remove([data.original_file_path]); if (storageError) return toast.error(storageError.message); const { error: updateError } = await supabase.from("datasets").update({ original_file_path: null }).eq("id", datasetId); if (updateError) toast.error(updateError.message); else toast.success("Original file deleted. Imported rows were kept."); }
  async function remove() {
    if (!window.confirm(`Delete "${datasetName}" and its rows, routing rules, and send history? This cannot be undone.`)) return;
    const supabase = getSupabaseBrowserClient();
    const { data: dataset } = originalFilePath ? { data: null } : await supabase.from("datasets").select("original_file_path").eq("id", datasetId).maybeSingle();
    const retainedPath = originalFilePath || dataset?.original_file_path;
    if (retainedPath) { const { error: storageError } = await supabase.storage.from("imports").remove([retainedPath]); if (storageError) return toast.error(`Could not delete the retained source file: ${storageError.message}`); }
    const { error } = await supabase.from("datasets").delete().eq("id", datasetId);
    if (error) toast.error(error.message); else { toast.success("Dataset deleted"); router.refresh(); }
  }
  return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Rename" onClick={rename}><Pencil size={15} /></Button><Button variant="ghost" size="icon" title="Save reusable mapping" onClick={duplicateMapping}><Copy size={15} /></Button><Button variant="ghost" size="icon" title="Export CSV" onClick={() => exportDataset("csv")}><Download size={15} /></Button><Button variant="ghost" size="icon" title="Export XLSX" onClick={() => exportDataset("xlsx")}><span className="text-[9px] font-bold">XLSX</span></Button><Button variant="ghost" size="icon" title="Delete retained source file" onClick={deleteOriginal}><FileX2 size={15} /></Button><Button variant="ghost" size="icon" title="Delete dataset" onClick={remove}><Trash2 size={15} /></Button></div>;
}
