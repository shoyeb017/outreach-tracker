"use client";

import { useState } from "react";
import { AlertTriangle, Eye, LoaderCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatasetRow } from "@/types";
import type { PreparedEmail } from "@/lib/email/render";

interface ReviewItem {
  row: DatasetRow;
  email: PreparedEmail;
  status: string;
  note?: string;
  warning?: string;
}

export function SendReviewDialog({ items, summary, routingColumnLabel, duplicatePolicy, duplicatePolicyLabel, microsoftEmail, live, preparing, onClose, onConfirm }: {
  items: ReviewItem[];
  summary: Record<string, number>;
  routingColumnLabel?: string;
  duplicatePolicy: "warn" | "block_template_recipient" | "allow";
  duplicatePolicyLabel: string;
  microsoftEmail?: string | null;
  live: boolean;
  preparing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [preview, setPreview] = useState<ReviewItem | null>(null);

  return <>
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10211b]/45 p-4" role="dialog" aria-modal="true">
      <Card className="max-h-[90vh] w-full max-w-5xl overflow-auto shadow-2xl">
        <CardHeader><div className="flex items-start justify-between"><div><div className="eyebrow">Ready to send</div><CardTitle className="mt-2 text-xl">Final send review</CardTitle><p className="mt-1 text-sm text-[#68736f]">Click any row to preview the exact resolved email before sending.</p></div><Button size="icon" variant="ghost" aria-label="Close final review" onClick={onClose}><XCircle size={18} /></Button></div></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Selected", items.length], ["Ready", summary.ready ?? 0], ["Warnings", items.filter((item) => item.warning).length], ["Invalid / missing", (summary.invalid_email ?? 0) + (summary.missing_email ?? 0)], ["Blocked", items.length - (summary.ready ?? 0)]].map(([label, value]) => <div className="rounded-lg border p-3" key={label}><div className="text-xs text-[#7a8581]">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div>
          <div className="mt-5 max-h-80 overflow-auto rounded-lg border"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 border-b bg-[#f7f9f8] text-[#68736f]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Recipient email</th><th className="px-3 py-2">{routingColumnLabel || "Template key"}</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Preview</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.row.id} tabIndex={0} role="button" aria-label={`Preview email for row ${item.row.row_number}`} className="cursor-pointer hover:bg-[#f5faf8] focus:bg-[#f5faf8] focus:outline-none" onClick={() => setPreview(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPreview(item); } }}><td className="px-3 py-2">{item.row.row_number}</td><td className="px-3 py-2 font-medium">{item.row.recipient_email || "Missing"}</td><td className="px-3 py-2">{item.row.routing_value || "Missing"}</td><td className="px-3 py-2">{item.email.template?.name || "Not resolved"}</td><td className="px-3 py-2"><Badge tone={item.warning ? "warning" : item.status === "ready" ? "success" : "warning"}>{item.warning ? "ready · warning" : item.status.replaceAll("_", " ")}</Badge></td><td className="px-3 py-2 text-[#68736f]">{item.note || item.warning || "All mappings resolved"}</td><td className="px-3 py-2 text-[#176b55]"><span className="inline-flex items-center gap-1 font-semibold"><Eye size={13} />Open</span></td></tr>)}</tbody></table></div>
          <div className="mt-5 rounded-lg bg-[#f4f7f5] p-4 text-sm"><div className="flex justify-between gap-4"><span>Template selection key</span><strong>{routingColumnLabel || "Not selected"}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Duplicate handling</span><strong>{duplicatePolicyLabel}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Microsoft From account</span><strong>{microsoftEmail || "Not connected"}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Mode</span><Badge tone={live ? "danger" : "success"}>{live ? "Live" : "Test simulation"}</Badge></div></div>
          {duplicatePolicy === "allow" && <p className="mt-4 flex gap-2 rounded-lg border border-[#efd6a6] bg-[#fffcf5] p-3 text-xs leading-5 text-[#895006]"><AlertTriangle size={15} className="shrink-0" />Duplicate protection is off for this send. Every ready spreadsheet row will be processed, even when several rows use the same email and template.</p>}
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={live ? "danger" : "default"} onClick={onConfirm} disabled={preparing || !(summary.ready ?? 0)}>{preparing && <LoaderCircle className="animate-spin" size={15} />}{live ? `Send ${summary.ready ?? 0} emails` : `Simulate ${summary.ready ?? 0} emails`}</Button></div>
        </CardContent>
      </Card>
    </div>
    {preview && <div className="fixed inset-0 z-[60] grid place-items-center bg-[#10211b]/55 p-4" role="dialog" aria-modal="true" aria-label="Resolved email preview">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto shadow-2xl">
        <CardHeader><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Exact email preview</div><CardTitle className="mt-2">Row {preview.row.row_number}</CardTitle><p className="mt-1 text-sm text-[#68736f]">This is the resolved subject and body that will be queued for this row.</p></div><Button size="icon" variant="ghost" aria-label="Close email preview" onClick={() => setPreview(null)}><XCircle size={18} /></Button></div></CardHeader>
        <CardContent>
          <div className="grid gap-3 rounded-lg bg-[#f5f8f6] p-4 text-sm sm:grid-cols-2"><div><span className="text-xs text-[#7a8581]">From</span><div className="font-semibold">{microsoftEmail || "Microsoft 365 not connected"}</div></div><div><span className="text-xs text-[#7a8581]">To</span><div className="font-semibold">{preview.row.recipient_email || "Missing"}</div></div><div><span className="text-xs text-[#7a8581]">Template selection value</span><div className="font-semibold">{preview.row.routing_value || "Missing"}</div></div><div><span className="text-xs text-[#7a8581]">Template</span><div className="font-semibold">{preview.email.template?.name || "Not resolved"}</div></div><div className="sm:col-span-2"><span className="text-xs text-[#7a8581]">Subject</span><div className="font-semibold">{preview.email.subject || "Missing"}</div></div></div>
          {(preview.note || preview.warning) && <div className="mt-4 rounded-lg border border-[#efd6a6] bg-[#fffcf5] p-3 text-sm text-[#895006]">{preview.note || preview.warning}</div>}
          <div className="mt-5 min-h-64 rounded-lg border bg-white p-5 text-sm leading-7" dangerouslySetInnerHTML={{ __html: preview.email.htmlBody || "<p>No email body resolved for this row.</p>" }} />
          <div className="mt-5 flex justify-end"><Button onClick={() => setPreview(null)}>Back to final review</Button></div>
        </CardContent>
      </Card>
    </div>}
  </>;
}
