"use client";

import { useState } from "react";
import { AlertTriangle, Eye, LoaderCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DatasetRow } from "@/types";
import type { PreparedEmail } from "@/lib/email/render";

interface ReviewItem {
  row: DatasetRow;
  email: PreparedEmail;
  status: string;
  note?: string;
  warning?: string;
}

export function SendReviewDialog({ items, summary, routingColumnLabel, duplicatePolicy, duplicatePolicyLabel, microsoftEmail, live, preparing, onClose, onConfirm, onRepair }: {
  items: ReviewItem[];
  summary: Record<string, number>;
  routingColumnLabel?: string;
  duplicatePolicy: "warn" | "block_template_recipient" | "allow";
  duplicatePolicyLabel: string;
  microsoftEmail?: string | null;
  live: boolean;
  preparing: boolean;
  onClose: () => void;
  onRepair: (target: "required setup" | "template routing" | "placeholder mapping" | "recipients") => void;
  onConfirm: () => void;
}) {
  const [preview, setPreview] = useState<ReviewItem | null>(null);

  return <>
    <Dialog title="Review and confirm" wide dismissible={!preparing} onClose={() => { if (!preparing) onClose(); }}>
      <p className="mb-5 text-sm text-[var(--muted-foreground)]">Ready rows will be processed; blocked rows will be skipped. Open any row to see the exact email.</p>
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Selected", items.length], ["Ready", summary.ready ?? 0], ["Warnings", items.filter((item) => item.warning).length], ["Invalid / missing", (summary.invalid_email ?? 0) + (summary.missing_email ?? 0)], ["Blocked", items.length - (summary.ready ?? 0)]].map(([label, value]) => <div className="rounded-lg border p-3" key={label}><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div>
          <section aria-label="Send summary" className="mt-5 rounded-lg bg-[var(--muted)] p-4 text-sm"><div className="flex justify-between gap-4"><span>Column that chooses the template</span><strong className="min-w-0 break-words text-right">{routingColumnLabel || "One template for everyone"}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Duplicate handling</span><strong className="min-w-0 break-words text-right">{duplicatePolicyLabel}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Microsoft From account</span><strong className="min-w-0 break-words text-right">{microsoftEmail || "Not connected"}</strong></div><div className="mt-2 flex justify-between gap-4"><span>Mode</span><Badge tone={live ? "danger" : "success"}>{live ? "Real emails" : "Practice — no emails sent"}</Badge></div></section>
          {duplicatePolicy === "allow" && <p className="mt-4 flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-5 text-[var(--muted-foreground)]"><AlertTriangle size={15} className="shrink-0" />Duplicate protection is off for this send. Every ready spreadsheet row will be processed, even when several rows use the same email and template.</p>}
          {items.some((item) => item.status !== "ready") && <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => onRepair("required setup")} disabled={preparing}>Change email setup</Button><Button variant="outline" onClick={() => onRepair("placeholder mapping")} disabled={preparing}>Connect missing fields</Button><Button variant="outline" onClick={() => onRepair("recipients")} disabled={preparing}>Edit recipients</Button></div>}
          <div role="group" aria-label="Review actions" className="mt-5 flex flex-wrap justify-end gap-3 border-t pt-4"><Button variant="outline" onClick={onClose} disabled={preparing}>Cancel</Button><Button variant={live ? "danger" : "default"} onClick={onConfirm} disabled={preparing || !(summary.ready ?? 0)}>{preparing && <LoaderCircle className="animate-spin" size={15} />}{live ? `Send ${summary.ready ?? 0} emails` : `Practice with ${summary.ready ?? 0} recipients`}</Button></div>
          <div className="table-frame mt-5 max-h-[55dvh]" role="region" aria-label="Recipient email review, scroll to see more columns" tabIndex={0}><table className="data-table w-full min-w-[1496px]"><colgroup>{[96, 300, 200, 240, 200, 320, 140].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead className="sticky top-0 border-b bg-[var(--surface-hover)] text-[var(--muted-foreground)]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Recipient email</th><th className="px-3 py-2">{routingColumnLabel || "Email selection"}</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Preview</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.row.id} className="cursor-pointer hover:bg-[var(--accent)] focus:bg-[var(--accent)] focus:outline-none" onClick={() => setPreview(item)}><td className="px-3 py-2">{item.row.row_number}</td><td className="px-3 py-2 font-medium">{item.row.recipient_email || "Missing"}</td><td className="px-3 py-2">{routingColumnLabel ? item.row.routing_value || "Empty" : "Everyone"}</td><td className="px-3 py-2">{item.email.template?.name || "Not resolved"}</td><td className="px-3 py-2"><Badge tone={item.warning ? "warning" : item.status === "ready" ? "success" : "warning"}>{item.warning ? "ready · warning" : item.status.replaceAll("_", " ")}</Badge></td><td className="px-3 py-2 text-[var(--muted-foreground)]">{item.note || item.warning || "All mappings resolved"}</td><td className="px-3 py-2 text-[var(--primary)]"><Button variant="ghost" size="sm" aria-label={`Preview email for row ${item.row.row_number}`} onClick={(event) => { event.stopPropagation(); setPreview(item); }}><Eye size={16} />Open</Button></td></tr>)}</tbody></table></div>
        </div>
    </Dialog>
    {preview && <Dialog title={`Email preview — row ${preview.row.row_number}`} onClose={() => setPreview(null)}>
        <div className="min-w-0">
          <div className="grid gap-3 rounded-lg bg-[var(--surface-hover)] p-4 text-sm sm:grid-cols-2"><div><span className="text-xs text-[var(--muted-foreground)]">From</span><div className="font-semibold">{microsoftEmail || "Microsoft not connected"}</div></div><div><span className="text-xs text-[var(--muted-foreground)]">To</span><div className="font-semibold">{preview.row.recipient_email || "Missing"}</div></div><div><span className="text-xs text-[var(--muted-foreground)]">Template selection value</span><div className="font-semibold">{preview.row.routing_value || "Missing"}</div></div><div><span className="text-xs text-[var(--muted-foreground)]">Template</span><div className="font-semibold">{preview.email.template?.name || "Not resolved"}</div></div><div className="sm:col-span-2"><span className="text-xs text-[var(--muted-foreground)]">Subject</span><div className="font-semibold">{preview.email.subject || "Missing"}</div></div></div>
          {(preview.note || preview.warning) && <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">{preview.note || preview.warning}</div>}
          <div className="email-content mt-5 min-h-64 rounded-lg border bg-[var(--card)] p-5 text-sm leading-7" dangerouslySetInnerHTML={{ __html: preview.email.htmlBody || "<p>No email body resolved for this row.</p>" }} />
          <div className="mt-5 flex justify-end"><Button onClick={() => setPreview(null)}>Back to final review</Button></div>
        </div>
    </Dialog>}
  </>;
}
