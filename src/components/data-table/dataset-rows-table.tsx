"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableDensityControl, type TableDensity } from "@/components/ui/table-density";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { DatasetColumn, DatasetRow, EmailTemplate, RoutingRule } from "@/types";

type ReviewRow = DatasetRow & { total_count?: number; outreach_status?: string; last_sent_at?: string; suppressed?: boolean; chosen_template_name?: string };
const labels: Record<string, string> = { sent: "Accepted by Microsoft", simulated: "Practice complete", failed: "Failed", not_sent: "Not sent" };
const PAGE_SIZE = 50;

export function DatasetRowsTable({ datasetId, columns, initialRows, initialCount, selection, onSelectionChange, onPreview, onEdit, onSuppress, rules }: {
  datasetId: string; columns: DatasetColumn[]; initialRows: DatasetRow[]; initialCount: number;
  selection: Set<string>; onSelectionChange: (value: Set<string>) => void;
  onPreview: (row: DatasetRow) => void; onEdit: (row: DatasetRow) => void; onSuppress: (row: DatasetRow) => void;
  templates: EmailTemplate[]; rules: RoutingRule[]; fallbackTemplateId?: string | null;
}) {
  const [rows, setRows] = useState<ReviewRow[]>(initialRows.slice(0, PAGE_SIZE));
  const [count, setCount] = useState(initialCount);
  const [search, setSearch] = useState("");
  const [emailFilter, setEmailFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("row_number");
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState("");
  const generation = useRef(0);
  const selectGeneration = useRef(0);
  const params = { p_dataset_id: datasetId, p_search: search.trim(), p_email_filter: emailFilter, p_status: status, p_group: group, p_sort: sort, p_desc: desc };
  useEffect(() => {
    const id = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true); setIssue("");
      const { data, error } = await getSupabaseBrowserClient().rpc("review_spreadsheet_rows", { p_dataset_id: datasetId, p_search: search.trim(), p_email_filter: emailFilter, p_status: status, p_group: group, p_sort: sort, p_desc: desc, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE });
      if (id !== generation.current) return;
      if (error) setIssue("We couldn't load recipients. Please try again. If this follows an upgrade, check that the spreadsheet migration has been applied.");
      else { const result = (data ?? []) as ReviewRow[]; setRows(result); setCount(Number(result[0]?.total_count ?? 0)); }
      setLoading(false);
    }, 250);
    return () => { clearTimeout(timer); if (generation.current === id) generation.current = id + 1; };
  }, [datasetId, search, emailFilter, status, group, sort, desc, page]);

  function selectPage(checked: boolean) { const next = new Set(selection); rows.forEach((row) => checked ? next.add(row.id) : next.delete(row.id)); onSelectionChange(next); }
  async function selectAll() {
    const id = ++selectGeneration.current;
    setLoading(true);
    try {
      const selected = new Set<string>();
      for (let offset = 0; offset < count; offset += 500) {
        const { data, error } = await getSupabaseBrowserClient().rpc("review_spreadsheet_rows", { ...params, p_limit: 500, p_offset: offset });
        if (error) throw error;
        if (id !== selectGeneration.current) return;
        (data ?? []).forEach((row: ReviewRow) => selected.add(row.id));
        if ((data ?? []).length < 500) break;
      }
      if (id === selectGeneration.current) onSelectionChange(selected);
    } catch { toast.error("We couldn't select the matching recipients. Please try again."); }
    finally { if (id === selectGeneration.current) setLoading(false); }
  }
  function changeFilter(set: (value: string) => void, value: string) { selectGeneration.current++; set(value); setPage(0); }
  function order(key: string) { setDesc(sort === key ? !desc : false); setSort(key); setPage(0); }
  const headers = [
    ["row_number", "Row"], ["recipient_email", "Recipient email"], ["routing_value", "Spreadsheet group"],
    ["chosen_template_name", "Email template"], ["outreach_status", "Send status"], ["last_sent_at", "Last result"],
    ...columns.filter((column) => column.standard_field !== "recipient_email" && !hidden.has(column.id)).map((column) => ["data:" + column.placeholder_slug, column.original_label]),
  ];
  const columnWidths = headers.map(([key]) => key === "row_number" ? 96 : key === "recipient_email" ? 320 : key === "chosen_template_name" ? 260 : 224);
  const tableWidth = 64 + 280 + columnWidths.reduce((total, width) => total + width, 0);
  return <div>
    <div className="mb-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
      <Input aria-label="Search recipients" placeholder="Search company, email, or any spreadsheet value" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} />
      <Select aria-label="Email quality" value={emailFilter} onChange={(event) => changeFilter(setEmailFilter, event.target.value)}><option value="all">All email addresses</option><option value="valid">Valid addresses</option><option value="missing">Missing addresses</option><option value="invalid">Invalid addresses</option></Select>
      <Select aria-label="Send status" value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}><option value="all">All send statuses</option><option value="not_sent">No previous result</option><option value="sent">Accepted by Microsoft</option><option value="simulated">Practice complete</option><option value="failed">Failed</option><option value="suppressed">Suppressed</option><option value="missing_template">No email template</option></Select>
      <Select aria-label="Spreadsheet group" value={group} onChange={(event) => changeFilter(setGroup, event.target.value)}><option value="">All spreadsheet groups</option>{rules.map((rule) => <option key={rule.id} value={rule.routing_value}>{rule.routing_value}</option>)}</Select>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--muted-foreground)]">Selections stay selected when you change filters.</p><details><summary className="cursor-pointer text-xs font-semibold">Choose visible columns</summary><div className="mt-2 grid gap-2 rounded-lg border bg-[var(--card)] p-3 sm:grid-cols-3">{columns.map((column) => <label key={column.id} className="text-xs"><input type="checkbox" checked={!hidden.has(column.id)} onChange={(event) => setHidden((current) => { const next = new Set(current); if (event.target.checked) next.delete(column.id); else next.add(column.id); return next; })} /> {column.original_label}</label>)}</div></details></div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--muted)] p-3"><span className="text-sm font-semibold">{selection.size.toLocaleString()} selected</span><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={loading} onClick={() => selectPage(true)}>Select this page</Button><Button size="sm" variant="ghost" disabled={loading || !count} onClick={selectAll}>Select all {count.toLocaleString()} matching</Button><Button size="sm" variant="ghost" onClick={() => { selectGeneration.current++; onSelectionChange(new Set()); }}>Deselect all</Button><Button size="sm" variant="ghost" disabled={loading} onClick={() => { const next = new Set(selection); rows.forEach((row) => next.has(row.id) ? next.delete(row.id) : next.add(row.id)); onSelectionChange(next); }}>Invert this page</Button></div></div>
    {issue && <p className="mb-3 rounded-lg bg-[var(--muted)] p-4 text-sm text-[var(--danger)]" role="alert">{issue}<Button variant="ghost" size="sm" onClick={() => setSearch((value) => value + " ")}>Retry</Button></p>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted-foreground)]">Scroll inside the table for more columns. Click a heading to sort.</p><TableDensityControl value={density} onChange={setDensity} /></div>
    <div className="table-frame max-h-[65dvh]" role="region" tabIndex={0} aria-label="Recipient table, scroll to see more columns" aria-busy={loading}><table className="data-table recipient-table w-full" data-density={density} style={{ minWidth: tableWidth }}><caption className="sr-only">Spreadsheet recipients, email quality, selected template, and send results</caption><colgroup><col style={{ width: 64 }} />{headers.map(([key], index) => <col key={key} style={{ width: columnWidths[index] }} />)}<col style={{ width: 280 }} /></colgroup><thead className="sticky top-0 z-10"><tr><th scope="col"><input aria-label="Select this page" type="checkbox" checked={rows.length > 0 && rows.every((row) => selection.has(row.id))} onChange={(event) => selectPage(event.target.checked)} /></th>{headers.map(([key, label]) => <th scope="col" key={key} aria-sort={sort === key ? desc ? "descending" : "ascending" : "none"}><button className="focus-ring text-left font-semibold" onClick={() => order(key)}>{label}{sort === key ? desc ? " ↓" : " ↑" : ""}</button></th>)}<th scope="col">Actions</th></tr></thead><tbody className={loading ? "opacity-60" : ""}>{rows.map((row) => <tr key={row.id} data-selected={selection.has(row.id)}><td><input aria-label={`Select row ${row.row_number}`} type="checkbox" checked={selection.has(row.id)} onChange={(event) => { const next = new Set(selection); if (event.target.checked) next.add(row.id); else next.delete(row.id); onSelectionChange(next); }} /></td>
      {headers.map(([key]) => <td className="break-words whitespace-normal" key={key}>{key === "recipient_email" ? <div><div className="font-medium">{row.recipient_email || "No email address"}</div><Badge className="mt-2" tone={row.email_valid ? "success" : "warning"}>{row.email_valid ? "Valid" : row.recipient_email ? "Invalid address" : "Missing address"}</Badge></div> : key === "outreach_status" ? <Badge tone={row.suppressed || row.outreach_status === "failed" ? "warning" : "neutral"}>{row.suppressed ? "Suppressed" : labels[row.outreach_status ?? "not_sent"] ?? row.outreach_status}</Badge> : key === "last_sent_at" ? row.last_sent_at ? formatDate(row.last_sent_at) : "—" : key === "chosen_template_name" ? row.chosen_template_name || "No email chosen" : key === "row_number" ? row.row_number : key === "routing_value" ? row.routing_value || "Everyone" : String(row.data[key.startsWith("data:") ? key.slice(5) : key] ?? "") || "Empty"}</td>)}
      <td className="p-3"><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={() => onPreview(row)}>Preview</Button><Button variant="ghost" size="sm" onClick={() => onEdit(row)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => onSuppress(row)}>Suppress</Button></div></td></tr>)}</tbody></table>{!rows.length && !loading && <div className="p-10 text-left text-sm text-[var(--muted-foreground)]">No recipients match your filters. Try a different search or clear the filters.</div>}</div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[var(--muted-foreground)]" role="status">{loading ? "Loading recipients…" : count ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count.toLocaleString()}` : "0 recipients"}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
  </div>;
}
