"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createExampleWorkbook } from "@/lib/spreadsheet/parser";
import { downloadBlob } from "@/lib/utils";

const fields = [
  ["Recipient email", "Required. Choose the column whose values become the email To addresses."],
  ["Template selection key", "Required. Choose a column such as Industry or Category whose values decide which template each row receives."],
  ["Subject", "Optional. A row-specific subject can override or fall back to the template subject."],
  ["Placeholder values", "Add any useful columns, such as Company Name, Contact, Website, Revenue, or City. After template routing, connect each detected placeholder to its spreadsheet column."],
];

export default function SpreadsheetGuidePage() {
  return <main className="page-shell">
    <PageHeader eyebrow="Import help" title="Spreadsheet format guide" description="Exact column names are never required. You explicitly choose the email destination key, template selection key, and every template-placeholder connection." actions={<><Button variant="outline" onClick={() => downloadBlob(createExampleWorkbook("csv"), "mail-automation-example.csv")}><Download size={15} />Example CSV</Button><Button onClick={() => downloadBlob(createExampleWorkbook("xlsx"), "mail-automation-example.xlsx")}><Download size={15} />Example XLSX</Button></>} />
    <div className="grid gap-6 xl:grid-cols-[1fr_.7fr]">
      <Card><CardHeader><CardTitle>What your spreadsheet needs</CardTitle></CardHeader><CardContent className="divide-y p-0">{fields.map(([name, description]) => <div className="px-5 py-4" key={name}><div className="text-sm font-semibold">{name}</div><p className="mt-1 text-sm text-[#68736f]">{description}</p></div>)}</CardContent></Card>
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Setup order</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-[#596561]"><p><strong>1.</strong> Choose the recipient email column and template selection key.</p><p><strong>2.</strong> Match each selection-key value to a template Category or Name.</p><p><strong>3.</strong> Connect every detected template placeholder to a spreadsheet column, then review each resolved row.</p></CardContent></Card>
        <Card><CardContent className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f3ee] text-[#176b55]"><FileSpreadsheet size={20} /></span><div><h3 className="font-semibold">Private by design</h3><p className="mt-1 text-sm leading-6 text-[#68736f]">The file is parsed locally first. If you choose to retain it, the original is uploaded only after review to a private Supabase bucket.</p></div></CardContent></Card>
      </div>
    </div>
  </main>;
}
