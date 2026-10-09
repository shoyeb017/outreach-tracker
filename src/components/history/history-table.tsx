"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Search } from "lucide-react";
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
  id: string; dataset_id: string; dataset_row_id: string; recipient_email: string; recipient_name: string | null; company_name: string | null;
  subject: string; final_html_body: string; final_plain_text_body: string | null; sender_microsoft_email: string | null; status: string;
  error_message: string | null; sent_at: string; is_test: boolean; datasets?: { name: string } | null; templates?: { name: string } | null;
}

export function HistoryTable({ rows, readOnlyDemo = false }: { rows: HistoryRow[]; readOnlyDemo?: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [dataset, setDataset] = useState("all"); const [template, setTemplate] = useState("all");
  const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState(""); const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [page, setPage] = useState(0);
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const datasets = useMemo(() => Array.from(new Map(rows.map((row) => [row.dataset_id, row.datasets?.name || "Spreadsheet"]))).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const templates = useMemo(() => Array.from(new Set(rows.map((row) => row.templates?.name).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const sent = new Date(row.sent_at); const after = !fromDate || sent >= new Date(`${fromDate}T00:00:00`); const before = !toDate || sent <= new Date(`${toDate}T23:59:59.999`);
    const haystack = [row.recipient_email, row.recipient_name, row.company_name, row.subject, row.datasets?.name, row.templates?.name].join(" ").toLowerCase();
    return (status === "all" || row.status === status) && (dataset === "all" || row.dataset_id === dataset) && (template === "all" || row.templates?.name === template) && after && before && haystack.includes(search.toLowerCase());
  }), [rows, search, status, dataset, template, fromDate, toDate]);
  function clearFilters() { setSearch(""); setStatus("all"); setDataset("all"); setTemplate("all"); setFromDate(""); setToDate(""); setPage(0); }
  function changeFilter(setValue: (value: string) => void, value: string) { setValue(value); setPage(0); }
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(currentPage * 25, currentPage * 25 + 25);
  function resultBadge(row: HistoryRow) { return <Badge tone={row.status === "sent" ? "success" : row.status === "simulated" ? "info" : row.status === "failed" ? "danger" : "warning"}>{row.status === "sent" ? "Accepted by Microsoft" : row.status === "simulated" ? "Practice complete" : row.status}{row.is_test ? " / test" : ""}</Badge>; }


  return <>
    <Card>
      <CardHeader className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div><label className="mb-2 block text-sm font-medium" htmlFor="history-search">Find an email</label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 text-[var(--muted-foreground)]" size={16} /><Input id="history-search" aria-label="Search history" className="pl-9" value={search} onChange={(e) => changeFilter(setSearch, e.target.value)} placeholder="Recipient, company, spreadsheet, or subject" /></div></div>
          <div><label className="mb-2 block text-sm font-medium" htmlFor="history-status">Result</label><Select id="history-status" aria-label="History status" value={status} onChange={(e) => changeFilter(setStatus, e.target.value)}><option value="all">All statuses</option><option value="sent">Accepted by Microsoft</option><option value="simulated">Practice complete</option><option value="failed">Failed</option><option value="skipped">Skipped</option></Select></div>
        </div>
        <details className="rounded-2xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Filter by spreadsheet, template, or date</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label className="mb-2 block text-sm" htmlFor="history-dataset">Spreadsheet</label><Select id="history-dataset" aria-label="Spreadsheet" value={dataset} onChange={(e) => changeFilter(setDataset, e.target.value)}><option value="all">All spreadsheets</option>{datasets.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</Select></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-template">Template</label><Select id="history-template" aria-label="Template" value={template} onChange={(e) => changeFilter(setTemplate, e.target.value)}><option value="all">All templates</option>{templates.map((name) => <option key={name}>{name}</option>)}</Select></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-from">From date</label><Input id="history-from" aria-label="From date" type="date" value={fromDate} onChange={(e) => changeFilter(setFromDate, e.target.value)} /></div>
          <div><label className="mb-2 block text-sm" htmlFor="history-to">To date</label><Input id="history-to" aria-label="To date" type="date" value={toDate} onChange={(e) => changeFilter(setToDate, e.target.value)} /></div>
        </div></details>
        <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-[var(--muted-foreground)]">{filtered.length.toLocaleString()} {filtered.length === 1 ? "email" : "emails"} found</p><div className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={clearFilters}>Clear filters</Button><TableDensityControl value={density} onChange={setDensity} /></div></div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 hidden text-xs text-[var(--muted-foreground)] md:block">Scroll inside the table when needed to see all email details.</p>
        <div className="table-frame hidden max-h-[70dvh] md:block" role="region" tabIndex={0} aria-label="Send history table, scroll to see more columns">
          <table className="data-table w-full min-w-[1040px]" data-density={density}>
            <caption className="sr-only">Email history. Recipient and company are grouped together; message details include the template and spreadsheet.</caption>
            <colgroup><col style={{ width: 156 }} /><col style={{ width: 280 }} /><col style={{ width: 320 }} /><col style={{ width: 188 }} /><col style={{ width: 96 }} /></colgroup>
            <thead className="sticky top-0 z-10"><tr><th scope="col">When</th><th scope="col">Recipient</th><th scope="col">Message & source</th><th scope="col">Result</th><th scope="col">Preview</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={row.id}>
              <td><time dateTime={row.sent_at}>{formatDate(row.sent_at)}</time></td>
              <td><p className="font-semibold">{row.recipient_email}</p>{row.recipient_name && <span className="cell-meta">{row.recipient_name}</span>}{row.company_name && <span className="cell-meta">{row.company_name}</span>}</td>
              <td><p className="font-semibold">{row.subject || "No subject"}</p><span className="cell-meta">Template: {row.templates?.name || "Not recorded"}</span>{readOnlyDemo ? <span className="cell-meta">Spreadsheet: {row.datasets?.name}</span> : <Link className="cell-meta" href={`/datasets/${row.dataset_id}`}>Spreadsheet: {row.datasets?.name || "Spreadsheet"}</Link>}</td>
              <td>{resultBadge(row)}{row.error_message && <span className="cell-meta">Open preview for error details.</span>}</td>
              <td><Button variant="ghost" size="icon" aria-label={`View full email to ${row.recipient_email}`} title="View full email" onClick={() => setSelected(row)}><Eye size={18} /></Button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-4 md:hidden" data-density={density} role="list" aria-label="Email history cards">{visibleRows.map((row) => <article key={row.id} role="listitem" className="history-mobile-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{resultBadge(row)}<time className="text-xs text-[var(--muted-foreground)]" dateTime={row.sent_at}>{formatDate(row.sent_at)}</time></div>
          <p className="break-all text-base font-semibold">{row.recipient_email}</p>{row.recipient_name && <p className="mt-2 text-sm">{row.recipient_name}</p>}{row.company_name && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{row.company_name}</p>}
          <p className="mt-5 border-t pt-4 text-sm font-semibold">{row.subject || "No subject"}</p><p className="mt-3 text-sm text-[var(--muted-foreground)]">Template: {row.templates?.name || "Not recorded"}</p>
          {readOnlyDemo ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">Spreadsheet: {row.datasets?.name}</p> : <Link className="mt-2 block text-sm text-[var(--primary)]" href={`/datasets/${row.dataset_id}`}>Spreadsheet: {row.datasets?.name || "Spreadsheet"}</Link>}
          <Button className="mt-5" variant="secondary" onClick={() => setSelected(row)}><Eye size={16} />View full email</Button>
        </article>)}</div>
        {!filtered.length && <div className="py-12 text-sm text-[var(--muted-foreground)]">No history matches these filters.</div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="text-sm text-[var(--muted-foreground)]">{filtered.length ? `${currentPage * 25 + 1}–${Math.min(currentPage * 25 + 25, filtered.length)} of ${filtered.length.toLocaleString()}` : "0 emails"} · Page {currentPage + 1} of {pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
      </CardContent>
    </Card>
    {selected && <Dialog title={selected.subject || "Saved email"} onClose={() => setSelected(null)}><div className="grid gap-5 rounded-2xl bg-[var(--muted)] p-5 text-sm sm:grid-cols-2"><div><p className="text-xs text-[var(--muted-foreground)]">From</p><p className="mt-2 break-all font-semibold">{selected.sender_microsoft_email || "Simulation"}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">To</p><p className="mt-2 break-all font-semibold">{selected.recipient_email}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">Template</p><p className="mt-2 font-semibold">{selected.templates?.name || "Not recorded"}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">Result</p><div className="mt-2">{resultBadge(selected)}</div></div></div>{selected.error_message && <div role="alert" className="mt-5 rounded-2xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{selected.error_message}</div>}<div className="email-content mt-6 rounded-2xl text-sm leading-7" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selected.final_html_body) }} />{!readOnlyDemo && <div className="mt-6 flex flex-wrap justify-between gap-3"><ButtonLink href={`/datasets/${selected.dataset_id}?tab=recipients`} variant="outline">View source row</ButtonLink><Button variant="outline" onClick={() => { if (window.confirm("Open the dataset to review and deliberately resend this recipient?")) router.push(`/datasets/${selected.dataset_id}?tab=recipients`); }}>Resend with review</Button></div>}</Dialog>}
  </>;
}
