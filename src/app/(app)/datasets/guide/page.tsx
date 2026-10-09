"use client";

import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createExampleWorkbook } from "@/lib/spreadsheet/parser";
import { downloadBlob } from "@/lib/utils";

export default function SpreadsheetGuidePage() {
  return <main className="page-shell">
    <PageHeader eyebrow="Quick guide" title="Your first outreach in five steps" description="You only need a spreadsheet and an email template. Start in practice mode; connect Microsoft later." actions={<Link href="/datasets/import" className="inline-flex items-center gap-2 rounded-lg border bg-[var(--card)] px-4 py-3 text-sm font-semibold"><ArrowLeft size={15} />Back to upload</Link>} />
    <div className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
      <Card><CardHeader><CardTitle>Follow this simple path</CardTitle></CardHeader><CardContent><ol className="space-y-5">{[
        ["Upload your spreadsheet", "Choose an Excel or CSV file (up to 15 MB and 10,000 rows per worksheet). Check the worksheet and preview."],
        ["Choose recipient emails", "Select Public Email, or whichever column contains the addresses to send to. Missing or invalid addresses are blocked."],
        ["Choose email templates", "Use one message for everyone, or choose a column such as Industry for different messages. Confirm each exact match; choose a default or skip unmatched values."],
        ["Personalize the email", "A field like {{company_name}} is replaced by a spreadsheet value. Connect it to Business Name. Any imported column can supply any field; only {{signature}} comes from Settings."],
        ["Review and practice", "Save your spreadsheet, select recipients, and review. Preview any row if you like. Practice sends save results without sending emails. Real sending needs Microsoft connection and final confirmation."],
      ].map(([title, copy], index) => <li key={title} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-sm font-bold text-[var(--primary)]">{index + 1}</span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{copy}</p></div></li>)}</ol></CardContent></Card>
      <div className="space-y-6"><Card><CardHeader><CardTitle>Try fictional contacts first</CardTitle></CardHeader><CardContent><div className="table-frame"><table className="data-table w-full min-w-[800px]"><colgroup><col style={{ width: 240 }} /><col style={{ width: 300 }} /><col style={{ width: 260 }} /></colgroup><thead className="bg-[var(--muted)]"><tr><th className="p-3">Business Name</th><th className="p-3">Public Email</th><th className="p-3">Industry</th></tr></thead><tbody><tr><td className="p-3">Northstar Labs</td><td className="p-3">avery@example.com</td><td className="p-3">Technology &amp; Software</td></tr></tbody></table></div><p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Connect <code>{"{{company_name}}"}</code> to <strong>Business Name</strong>. Your email becomes: “Hi Northstar Labs,”.</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => downloadBlob(createExampleWorkbook("xlsx"), "outreach-example.xlsx")}><Download size={15} />Download Excel</Button><Button variant="outline" onClick={() => downloadBlob(createExampleWorkbook("csv"), "outreach-example.csv")}>Download CSV</Button></div><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">Example addresses are not real contacts. Use practice mode for the sample.</p></CardContent></Card><Card><CardContent><h2 className="text-sm font-semibold">Where do results go?</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Send history keeps the exact email and its result. “Accepted by Microsoft” means Microsoft accepted it for sending, not proof of delivery. Keep your browser tab open while a batch runs.</p></CardContent></Card></div>
    </div>
  </main>;
}
