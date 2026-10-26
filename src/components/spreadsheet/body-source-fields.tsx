"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function BodySourceFields({ source, bodyColumn, subjectColumn, signature, columns, onSource, onBodyColumn, onSubjectColumn, onSignature, bodyExample, disabled = false }: {
  source: "template" | "spreadsheet"; bodyColumn: string; subjectColumn: string; signature: boolean;
  columns: { value: string; label: string }[]; disabled?: boolean; bodyExample?: string;
  onSource: (source: "template" | "spreadsheet") => void; onBodyColumn: (value: string) => void;
  onSubjectColumn: (value: string) => void; onSignature: (value: boolean) => void;
}) {
  return <section className="space-y-4 rounded-lg border p-4" aria-label="Email body source">
    <div><Label htmlFor="body-source">Where should the email body come from?</Label><Select id="body-source" disabled={disabled} value={source} onChange={event => onSource(event.target.value as "template" | "spreadsheet")}><option value="template">Use email templates</option><option value="spreadsheet">Use a spreadsheet body column</option></Select><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">The body is the main message inside the email. Use a template, or write a complete message for each row in your spreadsheet.</p></div>
    {source === "spreadsheet" && <>
      <div><Label htmlFor="body-column">Which column contains the email bodies? (required)</Label><Select required id="body-column" disabled={disabled} value={bodyColumn} onChange={event => onBodyColumn(event.target.value)}><option value="">Choose email body column</option>{columns.map(column => <option key={column.value} value={column.value}>{column.label}</option>)}</Select></div>
      <div><Label htmlFor="body-subject-column">Which column contains the subjects? (required)</Label><Select required id="body-subject-column" disabled={disabled} value={subjectColumn} onChange={event => onSubjectColumn(event.target.value)}><option value="">Choose subject column</option>{columns.map(column => <option key={column.value} value={column.value}>{column.label}</option>)}</Select></div>
      {bodyColumn && <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">Example body from the first row</p><div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--muted)] p-3 text-sm leading-6 [overflow-wrap:anywhere]">{bodyExample?.slice(0, 2000) || "This row has no body. Fill this cell before sending to this recipient."}{bodyExample && bodyExample.length > 2000 ? "…" : ""}</div></div>}
      <label className="flex items-start gap-3 text-sm"><input aria-label="Add my saved signature" className="mt-1" type="checkbox" disabled={disabled} checked={signature} onChange={event => onSignature(event.target.checked)} /><span>Add my saved signature<span className="mt-1 block text-xs leading-6 text-[var(--muted-foreground)]">Turn this off if your spreadsheet messages already include a signature.</span></span></label>
      <p className="text-xs leading-6 text-[var(--muted-foreground)]">No template is needed. Text and line breaks are preserved; HTML code is displayed as text. Rows with an empty subject or body are blocked until corrected. Review every email before sending.</p>
    </>}
  </section>;
}

export function SpreadsheetBodySummary({ body, subject, signature }: { body?: string; subject?: string; signature?: boolean }) {
  return <div className="space-y-4 rounded-lg border bg-[var(--muted)] p-5">
    <h3 className="text-sm font-semibold">Your spreadsheet supplies the email content</h3>
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">Template selection is not needed. Each recipient receives the message written in their own row.</p>
    <dl className="grid gap-4 text-sm sm:grid-cols-3">{[["Body column", body || "Not selected"], ["Subject column", subject || "Not selected"], ["Saved signature", signature === false ? "Not added" : "Added automatically"]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
    <p className="text-xs leading-6 text-[var(--muted-foreground)]">Use complete messages as written, or optional {"{{column_key}}"} fields that match your spreadsheet column keys. Missing values are flagged in the final review. Your saved engagement button can still be included.</p>
  </div>;
}
