"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { safeEngagementPreview } from "@/lib/engagement/core";
import { HistoryFollowup } from "./history-followup";
import { engagementRequest } from "@/lib/engagement/client";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableDensityControl, type TableDensity } from "@/components/ui/table-density";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { formatDate } from "@/lib/utils";

export interface HistoryRow {
  body_loaded?: boolean; sending_method?: "manual" | "scheduled" | "unknown";
  id: string; dataset_id: string | null; dataset_row_id: string | null; recipient_email: string; recipient_name: string | null; company_name: string | null;
  subject: string; final_html_body: string; final_plain_text_body: string | null; sender_microsoft_email: string | null; status: string;
  error_message: string | null; sent_at: string; is_test: boolean; datasets?: { name: string } | null; templates?: { name: string } | null;
}

export function HistoryTable({ rows, readOnlyDemo = false }: { rows: HistoryRow[]; readOnlyDemo?: boolean }) {
  const router = useRouter();
  const previewRequest = useRef(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("all"), [previewLoading, setPreviewLoading] = useState(false), [previewError, setPreviewError] = useState("");
  const selectionSource = rows.find(row => selection.has(row.id))?.dataset_id;
  function selectable(row: HistoryRow) { return !readOnlyDemo && !!row.dataset_id && !!row.dataset_row_id && !row.is_test && (!selectionSource || row.dataset_id === selectionSource); }
  function toggleRow(row: HistoryRow) { setSelection(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else if (selectable(row) && next.size < 500) next.add(row.id); return next; }); }
  async function openPreview(row: HistoryRow) {
    const request = ++previewRequest.current;
    setSelected(row); setPreviewError(""); setPreviewLoading(false);
    if (row.body_loaded !== false) return;
    setPreviewLoading(true);
    try {
      const body = await engagementRequest<{ final_html_body: string; final_plain_text_body: string | null }>(`/api/history/${row.id}`);
      if (request === previewRequest.current) setSelected(current => current?.id === row.id ? { ...current, ...body, body_loaded: true } : current);
    } catch (failure) { if (request === previewRequest.current) setPreviewError(failure instanceof Error ? failure.message : "Could not open this saved email."); }
    finally { if (request === previewRequest.current) setPreviewLoading(false); }
  }
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [dataset, setDataset] = useState("all"); const [template, setTemplate] = useState("all");
  const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState(""); const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [page, setPage] = useState(0);
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const datasets = useMemo(() => Array.from(new Map(rows.map((row) => [row.dataset_id ?? "scheduled-tests", row.datasets?.name || (row.dataset_id ? "Spreadsheet" : "Scheduled tests")]))).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const templates = useMemo(() => Array.from(new Set(rows.map((row) => row.templates?.name).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const sent = new Date(row.sent_at); const after = !fromDate || sent >= new Date(`${fromDate}T00:00:00`); const before = !toDate || sent <= new Date(`${toDate}T23:59:59.999`);
    const haystack = [row.recipient_email, row.recipient_name, row.company_name, row.subject, row.datasets?.name, row.templates?.name].join(" ").toLowerCase();
    return (method === "all" || row.sending_method === method) && (status === "all" || row.status === status) && (dataset === "all" || (row.dataset_id ?? "scheduled-tests") === dataset) && (template === "all" || row.templates?.name === template) && after && before && haystack.includes(search.toLowerCase());
  }), [rows, search, status, dataset, template, fromDate, toDate, method]);
  function clearFilters() { setSelection(new Set()); setMethod("all"); setSearch(""); setStatus("all"); setDataset("all"); setTemplate("all"); setFromDate(""); setToDate(""); setPage(0); }
  function changeFilter(setValue: (value: string) => void, value: string) { setSelection(new Set()); setValue(value); setPage(0); }
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(currentPage * 25, currentPage * 25 + 25);
  function resultBadge(row: HistoryRow) { return <Badge tone={row.status === "sent" ? "success" : row.status === "simulated" ? "info" : row.status === "failed" ? "danger" : "warning"}>{row.status === "sent" ? "Accepted by Microsoft" : row.status === "simulated" ? "Practice complete" : row.status}{row.is_test ? " / test" : ""}</Badge>; }
  function methodLabel(row: HistoryRow) { return row.sending_method === "scheduled" ? "Scheduled send" : row.sending_method === "manual" ? "Send now" : "Sending method not recorded"; }
  function sourceLink(row: HistoryRow) { return !row.dataset_id ? <Link className="cell-meta" href="/scheduled">Scheduled test email · no spreadsheet</Link> : readOnlyDemo ? <span className="cell-meta">Spreadsheet: {row.datasets?.name}</span> : <Link className="cell-meta" href={`/datasets/${row.dataset_id}`}>Spreadsheet: {row.datasets?.name || "Spreadsheet"}</Link>; }


  return <>
    <Card>
      <CardHeader className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
          <div><label className="mb-2 block text-sm font-medium" htmlFor="history-search">Find an email</label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 text-[var(--muted-foreground)]" size={16} /><Input id="history-search" aria-label="Search history" className="pl-9" value={search} onChange={(e) => changeFilter(setSearch, e.target.value)} placeholder="Recipient, company, spreadsheet, or subject" /></div></div>
          <div><label className="mb-2 block text-sm font-medium" htmlFor="history-status">Result</label><Select id="history-status" aria-label="History status" value={status} onChange={(e) => changeFilter(setStatus, e.target.value)}><option value="all">All statuses</option><option value="sent">Accepted by Microsoft</option><option value="simulated">Practice complete</option><option value="failed">Failed</option><option value="skipped">Skipped</option><option value="cancelled">Cancelled</option></Select></div>
          <div><label className="mb-2 block text-sm font-medium" htmlFor="history-method">Sending method</label><Select id="history-method" value={method} onChange={event => changeFilter(setMethod, event.target.value)}><option value="all">Send now and scheduled</option><option value="manual">Send now</option><option value="scheduled">Scheduled sends</option></Select></div>
        </div>
        <details className="rounded-2xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Filter by spreadsheet, template, or date</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label className="mb-2 block text-sm" htmlFor="history-dataset">Spreadsheet</label><Select id="history-dataset" aria-label="Spreadsheet" value={dataset} onChange={(e) => changeFilter(setDataset, e.target.value)}><option value="all">All spreadsheets</option>{datasets.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</Select></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-template">Template</label><Select id="history-template" aria-label="Template" value={template} onChange={(e) => changeFilter(setTemplate, e.target.value)}><option value="all">All templates</option>{templates.map((name) => <option key={name}>{name}</option>)}</Select></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-from">From date</label><Input id="history-from" aria-label="From date" type="date" value={fromDate} onChange={(e) => changeFilter(setFromDate, e.target.value)} /></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-to">To date</label><Input id="history-to" aria-label="To date" type="date" value={toDate} onChange={(e) => changeFilter(setToDate, e.target.value)} /></div>
        </div></details>
        <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-[var(--muted-foreground)]">{filtered.length.toLocaleString()} {filtered.length === 1 ? "email" : "emails"} found</p><div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={readOnlyDemo} onClick={() => router.refresh()}><RefreshCw size={15} />Refresh</Button><Button variant="ghost" onClick={clearFilters}>Clear filters</Button><TableDensityControl value={density} onChange={setDensity} /></div></div>
      </CardHeader>
      <CardContent>
        {!readOnlyDemo && <div className="mb-5 space-y-3 rounded-md border bg-[var(--muted)] p-4">
          <p className="text-sm font-semibold">{selection.size} selected for follow-up</p>
          <p className="text-xs leading-6 text-[var(--muted-foreground)]">Select recipients from one spreadsheet. No link click is needed. Test emails cannot be reused. Changing filters clears your selection; changing pages keeps it.</p>
          <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!filtered.some(selectable)} onClick={() => {
            const source = selectionSource || (dataset !== "all" ? dataset : filtered.find(selectable)?.dataset_id);
            if (!source) return;
            setSelection(new Set(filtered.filter(row => selectable(row) && row.dataset_id === source).slice(0, 500).map(row => row.id)));
          }}>Select matching (up to 500)</Button><Button variant="ghost" disabled={!selection.size} onClick={() => setSelection(new Set())}>Clear selection</Button><HistoryFollowup ids={[...selection]} onCreated={() => setSelection(new Set())} /></div>
          {selectionSource && <p className="text-xs text-[var(--muted-foreground)]">Selection spreadsheet: {rows.find(row => row.dataset_id === selectionSource)?.datasets?.name || "Spreadsheet"}. Other spreadsheets remain unselected.</p>}
        </div>}
        <p className="mb-3 hidden text-xs text-[var(--muted-foreground)] md:block">Scroll inside the table when needed to see all email details.</p>
        <div className="table-frame hidden max-h-[70dvh] md:block" role="region" tabIndex={0} aria-label="Send history table, scroll to see more columns">
          <table className="data-table w-full min-w-[1040px]" data-density={density}>
            <caption className="sr-only">Email history. Recipient and company are grouped together; message details include the template and spreadsheet.</caption>
            <colgroup><col style={{ width: 156 }} /><col style={{ width: 280 }} /><col style={{ width: 320 }} /><col style={{ width: 188 }} /><col style={{ width: 96 }} /></colgroup>
            <thead className="sticky top-0 z-10"><tr><th scope="col">When</th><th scope="col">Recipient</th><th scope="col">Message & source</th><th scope="col">Result</th><th scope="col">Preview</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={row.id}>
              <td><time dateTime={row.sent_at}>{formatDate(row.sent_at)}</time></td>
              <td>{!readOnlyDemo && <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`Select ${row.recipient_email}, history ${row.id}`} checked={selection.has(row.id)} disabled={!selectable(row) || (!selection.has(row.id) && selection.size >= 500)} onChange={() => toggleRow(row)} />Select for follow-up</label>}<p className="font-semibold">{row.recipient_email}</p>{row.recipient_name && <span className="cell-meta">{row.recipient_name}</span>}{row.company_name && <span className="cell-meta">{row.company_name}</span>}</td>
              <td><p className="font-semibold">{row.subject || "No subject"}</p><span className="cell-meta">Template: {row.templates?.name || (row.dataset_id ? "Not recorded" : "Fixed test message")}</span>{sourceLink(row)}</td>
              <td>{resultBadge(row)}<span className="cell-meta">{methodLabel(row)}</span>{row.error_message && <span className="cell-meta">Open preview for error details.</span>}</td>
              <td><Button variant="ghost" size="icon" aria-label={`View full email to ${row.recipient_email}`} title="View full email" onClick={() => void openPreview(row)}><Eye size={18} /></Button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-4 md:hidden" data-density={density} role="list" aria-label="Email history cards">{visibleRows.map((row) => <article key={row.id} role="listitem" className="history-mobile-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{resultBadge(row)}<time className="text-xs text-[var(--muted-foreground)]" dateTime={row.sent_at}>{formatDate(row.sent_at)}</time></div>
          {!readOnlyDemo && <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`Select ${row.recipient_email}, history ${row.id} (mobile)`} checked={selection.has(row.id)} disabled={!selectable(row) || (!selection.has(row.id) && selection.size >= 500)} onChange={() => toggleRow(row)} />Select for follow-up</label>}<p className="mb-2 text-xs text-[var(--muted-foreground)]">{methodLabel(row)}</p><p className="break-all text-base font-semibold">{row.recipient_email}</p>{row.recipient_name && <p className="mt-2 text-sm">{row.recipient_name}</p>}{row.company_name && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{row.company_name}</p>}
          <p className="mt-5 border-t pt-4 text-sm font-semibold">{row.subject || "No subject"}</p><p className="mt-3 text-sm text-[var(--muted-foreground)]">Template: {row.templates?.name || "Not recorded"}</p>
          {sourceLink(row)}
          <Button className="mt-5" variant="secondary" onClick={() => setSelected(row)}><Eye size={16} />View full email</Button>
        </article>)}</div>
        {!filtered.length && <div className="py-12 text-sm text-[var(--muted-foreground)]">No history matches these filters.</div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="text-sm text-[var(--muted-foreground)]">{filtered.length ? `${currentPage * 25 + 1}–${Math.min(currentPage * 25 + 25, filtered.length)} of ${filtered.length.toLocaleString()}` : "0 emails"} · Page {currentPage + 1} of {pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
      </CardContent>
    </Card>
    {selected && <Dialog title={selected.subject || "Saved email"} onClose={() => { previewRequest.current++; setSelected(null); }}>
      <div className="grid gap-5 rounded-2xl bg-[var(--muted)] p-5 text-sm sm:grid-cols-2"><div><p className="text-xs text-[var(--muted-foreground)]">From</p><p className="mt-2 break-all font-semibold">{selected.sender_microsoft_email || "Simulation"}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">To</p><p className="mt-2 break-all font-semibold">{selected.recipient_email}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">Template</p><p className="mt-2 font-semibold">{selected.templates?.name || (selected.dataset_id ? "Not recorded" : "Fixed test message")}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">Result</p><div className="mt-2">{resultBadge(selected)}</div></div></div>
      {selected.error_message && <div role="alert" className="mt-5 rounded-2xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{selected.error_message}</div>}
      {previewLoading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm"><LoaderCircle size={16} className="animate-spin" />Loading saved email…</p> : previewError ? <div role="alert" className="mt-5 space-y-3 text-sm"><p>{previewError}</p><Button variant="outline" onClick={() => void openPreview(selected)}>Retry preview</Button></div> : <div className="email-content mt-6 rounded-2xl text-sm leading-7" dangerouslySetInnerHTML={{ __html: safeEngagementPreview(sanitizeEmailHtml(selected.final_html_body)) }} />}
      {!readOnlyDemo && <div className="mt-6 flex flex-wrap justify-between gap-3">{selected.dataset_id ? <><ButtonLink href={`/datasets/${selected.dataset_id}?tab=recipients`} variant="outline">View source row</ButtonLink><Button variant="outline" onClick={() => { if (window.confirm("Open the dataset to review and deliberately resend this recipient?")) router.push(`/datasets/${selected.dataset_id}?tab=recipients`); }}>Resend with review</Button></> : <ButtonLink href="/scheduled" variant="outline">View scheduled email results</ButtonLink>}</div>}
    </Dialog>}
  </>;
}
