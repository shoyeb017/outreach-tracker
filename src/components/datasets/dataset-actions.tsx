"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileX2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { downloadBlob } from "@/lib/utils";

export function DatasetActions({ datasetId, datasetName, originalFilePath }: { datasetId: string; datasetName: string; originalFilePath?: string | null }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  async function exportSpreadsheet(format: "csv" | "xlsx") {
    if (exporting) return;
    setExporting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: columns, error: columnError } = await supabase.from("dataset_columns").select("original_label,placeholder_slug").eq("dataset_id", datasetId).order("display_order");
      if (columnError) throw columnError;
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.rpc("review_spreadsheet_rows", { p_dataset_id: datasetId, p_limit: 500, p_offset: offset });
        if (error) throw error;
        for (const row of data ?? []) {
          const original = Object.fromEntries((columns ?? []).map((column) => [column.original_label, row.data[column.placeholder_slug] ?? ""]));
          rows.push({ ...original, "Outreach: Send status": row.outreach_status === "sent" ? "Accepted by Microsoft" : row.outreach_status === "simulated" ? "Practice complete" : row.outreach_status || "Not sent", "Outreach: Last result": row.last_sent_at || "", "Outreach: Email template": row.chosen_template_name || "", "Outreach: Suppressed": row.suppressed ? "Yes" : "No", "Outreach: Last error": row.last_error || "" });
        }
        if ((data ?? []).length < 500) break;
      }
      // CSV cells must never become spreadsheet formulas when reopened.
      const safe = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && (/^[=+@-]/.test(value) || value.startsWith(String.fromCharCode(9)) || value.startsWith(String.fromCharCode(13))) ? "'" + value : value])));
      const sheet = XLSX.utils.json_to_sheet(safe); const baseName = datasetName.replace(/[^a-z0-9-_]+/gi, "-");
      if (format === "csv") downloadBlob(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" }), baseName + "-results.csv");
      else { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Results"); downloadBlob(new Blob([XLSX.write(book, { type: "array", bookType: "xlsx" })]), baseName + "-results.xlsx"); }
      toast.success(rows.length.toLocaleString() + " recipients exported.");
    } catch { toast.error("Export failed. Please try again."); }
    finally { setExporting(false); }
  }
  async function rename() { const next = window.prompt("Spreadsheet name", datasetName)?.trim(); if (!next || next === datasetName) return; const { error } = await getSupabaseBrowserClient().from("datasets").update({ name: next }).eq("id", datasetId); if (error) toast.error(error.message); else { toast.success("Spreadsheet renamed"); router.refresh(); } }
  async function duplicateMapping() {
    const profileName = window.prompt("Save this setup as", `${datasetName} setup`)?.trim();
    if (!profileName) return;
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in again before saving your setup.");
    const [dataset, columns, rules, fields] = await Promise.all([
      supabase.from("datasets").select("subject_strategy,routing_column_id,fallback_template_id").eq("id", datasetId).single(),
      supabase.from("dataset_columns").select("id,original_label,standard_field").eq("dataset_id", datasetId),
      supabase.from("routing_rules").select("routing_value,action,template_id").eq("dataset_id", datasetId),
      supabase.from("dataset_placeholder_mappings").select("placeholder,column_id").eq("dataset_id", datasetId),
    ]);
    const error = dataset.error || columns.error || rules.error || fields.error;
    if (error) return toast.error(error.message);
    if (!dataset.data) return toast.error("This spreadsheet is no longer available.");
    const routing = columns.data?.find((column) => column.id === dataset.data.routing_column_id);
    const mappings = Object.fromEntries((columns.data ?? []).filter((column) => column.standard_field).map((column) => [column.standard_field!, column.original_label]));
    for (const field of fields.data ?? []) {
      const column = columns.data?.find((entry) => entry.id === field.column_id);
      if (column) mappings["field:" + field.placeholder] = column.original_label;
    }
    const routingRules = Object.fromEntries((rules.data ?? []).map((rule) => [rule.routing_value, { action: rule.action, templateId: rule.template_id ?? "" }]));
    const { error: saveError } = await supabase.from("column_mapping_profiles").upsert({
      user_id: user.id, name: profileName, source_columns: (columns.data ?? []).map((column) => column.original_label),
      mappings, routing_key_label: routing?.original_label ?? null,
      routing_rules: { ...routingRules, __default: { action: "fallback", templateId: dataset.data.fallback_template_id ?? "" } },
      subject_strategy: dataset.data.subject_strategy,
    }, { onConflict: "user_id,name" });
    if (saveError) toast.error(saveError.message); else toast.success("Reusable setup saved, including personalization fields.");
  }
  async function deleteOriginal() { const supabase = getSupabaseBrowserClient(); const { data, error } = await supabase.from("datasets").select("original_file_path").eq("id", datasetId).single(); if (error) return toast.error(error.message); if (!data.original_file_path) return toast.info("No original file is retained for this dataset."); if (!window.confirm("Delete the retained source spreadsheet? Imported rows will remain.")) return; const { error: storageError } = await supabase.storage.from("imports").remove([data.original_file_path]); if (storageError) return toast.error(storageError.message); const { error: updateError } = await supabase.from("datasets").update({ original_file_path: null }).eq("id", datasetId); if (updateError) toast.error(updateError.message); else toast.success("Original file deleted. Imported rows were kept."); }
  async function remove() {
    if (!window.confirm(`Delete "${datasetName}" and its rows, routing rules, and send history? This cannot be undone.`)) return;
    const supabase = getSupabaseBrowserClient();
    const { data: dataset } = originalFilePath ? { data: null } : await supabase.from("datasets").select("original_file_path").eq("id", datasetId).maybeSingle();
    const retainedPath = originalFilePath || dataset?.original_file_path;
    if (retainedPath) { const { error: storageError } = await supabase.storage.from("imports").remove([retainedPath]); if (storageError) return toast.error(`Could not delete the retained source file: ${storageError.message}`); }
    const { error } = await supabase.from("datasets").delete().eq("id", datasetId);
    if (error) toast.error(error.message); else { toast.success("Spreadsheet deleted"); router.refresh(); }
  }
  return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Rename" onClick={rename}><Pencil size={15} /></Button><Button variant="ghost" size="icon" title="Save reusable mapping" onClick={duplicateMapping}><Copy size={15} /></Button><Button variant="ghost" size="icon" disabled={exporting} title="Export CSV" onClick={() => exportSpreadsheet("csv")}><Download size={15} /></Button><Button variant="ghost" size="icon" disabled={exporting} title="Export XLSX" onClick={() => exportSpreadsheet("xlsx")}><span className="text-[9px] font-bold">XLSX</span></Button><Button variant="ghost" size="icon" title="Delete retained source file" onClick={deleteOriginal}><FileX2 size={15} /></Button><Button variant="ghost" size="icon" title="Delete spreadsheet" onClick={remove}><Trash2 size={15} /></Button></div>;
}
