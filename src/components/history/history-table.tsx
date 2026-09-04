"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { formatDate } from "@/lib/utils";

interface HistoryRow {
  id: string; dataset_id: string; dataset_row_id: string; recipient_email: string; recipient_name: string | null; company_name: string | null;
  subject: string; final_html_body: string; final_plain_text_body: string | null; sender_microsoft_email: string | null; status: string;
  error_message: string | null; sent_at: string; is_test: boolean; datasets?: { name: string } | null; templates?: { name: string } | null;
}

export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [dataset, setDataset] = useState("all"); const [template, setTemplate] = useState("all");
  const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState(""); const [selected, setSelected] = useState<HistoryRow | null>(null);
  const datasets = useMemo(() => Array.from(new Map(rows.map((row) => [row.dataset_id, row.datasets?.name || "Dataset"]))).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const templates = useMemo(() => Array.from(new Set(rows.map((row) => row.templates?.name).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const sent = new Date(row.sent_at); const after = !fromDate || sent >= new Date(`${fromDate}T00:00:00`); const before = !toDate || sent <= new Date(`${toDate}T23:59:59.999`);
    const haystack = [row.recipient_email, row.recipient_name, row.company_name, row.subject, row.datasets?.name, row.templates?.name].join(" ").toLowerCase();
    return (status === "all" || row.status === status) && (dataset === "all" || row.dataset_id === dataset) && (template === "all" || row.templates?.name === template) && after && before && haystack.includes(search.toLowerCase());
  }), [rows, search, status, dataset, template, fromDate, toDate]);
  function clearFilters() { setSearch(""); setStatus("all"); setDataset("all"); setTemplate("all"); setFromDate(""); setToDate(""); }

  return <>
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap gap-2"><div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-[#8b9692]" size={15} /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recipient, company, dataset, subject..." /></div><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="sent">Sent</option><option value="simulated">Simulated</option><option value="failed">Failed</option><option value="skipped">Skipped</option></Select></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_auto]"><Select value={dataset} onChange={(e) => setDataset(e.target.value)}><option value="all">All datasets</option>{datasets.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</Select><Select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="all">All templates</option>{templates.map((name) => <option key={name}>{name}</option>)}</Select><Input aria-label="From date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><Input aria-label="To date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /><Button variant="outline" onClick={clearFilters}>Clear filters</Button></div>
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b bg-[#f7f9f8] text-xs uppercase tracking-wide text-[#71807a]"><tr><th className="px-5 py-3">Date</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Dataset</th><th className="px-4 py-3">Template</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y">{filtered.map((row) => <tr key={row.id} className="hover:bg-[#fafcfb]"><td className="px-5 py-4 text-xs text-[#68736f]">{formatDate(row.sent_at)}</td><td className="px-4 py-4"><div className="font-semibold">{row.recipient_email}</div><div className="mt-1 text-xs text-[#7a8581]">{row.recipient_name || "-"}</div></td><td className="px-4 py-4">{row.company_name || "-"}</td><td className="px-4 py-4"><Link className="font-medium hover:text-[#176b55]" href={`/datasets/${row.dataset_id}`}>{row.datasets?.name || "Dataset"}</Link></td><td className="px-4 py-4">{row.templates?.name || "-"}</td><td className="max-w-72 truncate px-4 py-4">{row.subject}</td><td className="px-4 py-4"><Badge tone={row.status === "sent" ? "success" : row.status === "simulated" ? "info" : row.status === "failed" ? "danger" : "warning"}>{row.status}{row.is_test ? " / test" : ""}</Badge></td><td className="px-4 py-4"><Button variant="ghost" size="icon" title="View full email" onClick={() => setSelected(row)}><Eye size={15} /></Button></td></tr>)}</tbody></table>{!filtered.length && <div className="py-16 text-center text-sm text-[#7a8581]">No history matches these filters.</div>}</div></CardContent>
    </Card>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10211b]/45 p-4"><Card className="max-h-[92vh] w-full max-w-3xl overflow-auto shadow-2xl"><CardHeader><div className="flex justify-between"><div><div className="eyebrow">Saved email snapshot</div><CardTitle className="mt-2">{selected.subject}</CardTitle></div><Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X size={18} /></Button></div></CardHeader><CardContent><div className="grid gap-3 rounded-lg bg-[#f5f8f6] p-4 text-sm sm:grid-cols-2"><div><div className="text-xs text-[#7a8581]">From</div><strong>{selected.sender_microsoft_email || "Simulation"}</strong></div><div><div className="text-xs text-[#7a8581]">To</div><strong>{selected.recipient_email}</strong></div><div><div className="text-xs text-[#7a8581]">Template</div><strong>{selected.templates?.name || "-"}</strong></div><div><div className="text-xs text-[#7a8581]">Status</div><strong>{selected.status}</strong></div></div>{selected.error_message && <div className="mt-4 rounded-lg bg-[#fff3f2] p-3 text-sm text-[#9b241c]">{selected.error_message}</div>}<div className="mt-5 rounded-lg border p-5 text-sm leading-7" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selected.final_html_body) }} /><div className="mt-5 flex justify-between"><Link href={`/datasets/${selected.dataset_id}?tab=recipients`}><Button variant="outline">View source row</Button></Link><Button variant="outline" onClick={() => { if (window.confirm("Open the dataset to review and deliberately resend this recipient?")) router.push(`/datasets/${selected.dataset_id}?tab=recipients`); }}>Resend with review</Button></div></CardContent></Card></div>}
  </>;
}
