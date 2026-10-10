"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Braces, CheckCircle2, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { datasetSteps } from "@/lib/datasets/workflow";
import { WorkflowSteps } from "@/components/layout/workflow-steps";
import { isValidEmail } from "@/lib/validation/email";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapImportedRow, parseSpreadsheetFile, type ParsedSheet } from "@/lib/spreadsheet/parser";
import { dataPlaceholdersForTemplates } from "@/lib/templates/dataset-mapping";
import { groupRoutingValues, normalizeRoutingValue, suggestTemplate } from "@/lib/templates/routing";
import type { EmailTemplate, SubjectStrategy } from "@/types";

const steps = ["Upload", datasetSteps[0].label, datasetSteps[1].label, datasetSteps[2].label, "Save spreadsheet"];
export interface MappingProfile { id: string; name: string; mappings: Record<string, string>; routing_key_label: string | null; routing_rules: Record<string, { action: "template" | "fallback" | "skip"; templateId: string }>; subject_strategy: SubjectStrategy }

function autoMapping(columns: ParsedSheet["columns"]) {
  const aliases: Record<string, string[]> = {
    recipient_email: ["email", "email_address", "emailaddress", "recipient_email", "public_email", "contact_email"],
    subject: ["subject", "email_subject"],
  };
  return Object.fromEntries(Object.entries(aliases).map(([field, candidates]) => [field, columns.find((column) => candidates.includes(column.slug))?.originalLabel ?? ""]));
}

function suggestPlaceholderColumn(placeholder: string, parsed: ParsedSheet, mapping: Record<string, string>, routingColumn: string) {
  if (placeholder === "recipient_email" && mapping.recipient_email) return mapping.recipient_email;
  if (placeholder === "subject" && mapping.subject) return mapping.subject;
  if (placeholder === "industry" && routingColumn) return routingColumn;
  const aliases: Record<string, string[]> = {
    recipient_name: ["name", "full_name", "contact", "contact_name"], first_name: ["firstname", "given_name"], last_name: ["lastname", "surname", "family_name"],
    company_name: ["company", "organization", "organisation", "business_name", "account_name"], company_email: ["business_email", "organization_email"],
    industry: ["category", "sector", "main_industry"], business_type: ["company_type", "customer_type"], phone: ["phone_number", "telephone", "mobile"],
    website: ["site", "url", "company_website"], location: ["city", "address", "region", "country"],
  };
  const candidates = new Set([placeholder, ...(aliases[placeholder] ?? [])]);
  return parsed.columns.find((column) => candidates.has(column.slug))?.originalLabel ?? "";
}

export function ImportWizard({ templates, mappingProfiles = [] }: { templates: EmailTemplate[]; mappingProfiles?: MappingProfile[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0); const [file, setFile] = useState<File | null>(null); const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); const [routingColumn, setRoutingColumn] = useState("");
  const [templateMode, setTemplateMode] = useState<"single" | "column">("single");
  const [issue, setIssue] = useState("");
  const [routeMap, setRouteMap] = useState<Record<string, { action: "template" | "fallback" | "skip"; templateId: string }>>({});
  const [placeholderMap, setPlaceholderMap] = useState<Record<string, string>>({});
  const [datasetName, setDatasetName] = useState(""); const [subjectStrategy, setSubjectStrategy] = useState<SubjectStrategy>("template");
  const [fallbackTemplate, setFallbackTemplate] = useState(""); const [pending, setPending] = useState(false);

  const routeValues = useMemo(() => {
    if (!parsed || !routingColumn) return [];
    const counts = new Map<string, number>();
    for (const row of parsed.rows) { const value = String(row[routingColumn] ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }
    return groupRoutingValues(Array.from(counts, ([routing_value, row_count]) => ({ routing_value, row_count }))).map((group) => group.routing_value);
  }, [parsed, routingColumn]);
  const selectedTemplates = useMemo(() => {
    const ids = new Set((templateMode === "column" ? routeValues.map((value) => routeMap[value]).filter(Boolean) : []).filter((route) => route.action === "template" && route.templateId).map((route) => route.templateId));
    if (fallbackTemplate) ids.add(fallbackTemplate);
    return templates.filter((template) => ids.has(template.id) && template.is_active && !template.is_archived);
  }, [fallbackTemplate, routeMap, templates, templateMode, routeValues]);
  const requiredPlaceholders = useMemo(() => dataPlaceholdersForTemplates(selectedTemplates, subjectStrategy !== "spreadsheet"), [selectedTemplates, subjectStrategy]);

  useEffect(() => { if (!parsed) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [parsed]);

  const missingFields = requiredPlaceholders.filter((token) => !parsed?.columns.some((column) => column.originalLabel === placeholderMap[token]));
  function setupIssue() {
    if (!parsed?.rows.length) return "Choose a worksheet with at least one row.";
    if (!parsed.columns.some((column) => column.originalLabel === mapping.recipient_email)) return "Choose the column containing recipient email addresses.";
    if (subjectStrategy !== "template") {
      if (!parsed.columns.some((column) => column.originalLabel === mapping.subject)) return "Choose the spreadsheet column containing subject lines, or use template subjects only.";
      if (mapping.subject === mapping.recipient_email) return "Email addresses and subjects must use different columns.";
    }
    return "";
  }
  function templateIssue() {
    const activeIds = new Set(templates.filter((template) => template.is_active && !template.is_archived).map((template) => template.id));
    if (templateMode === "single" && !activeIds.has(fallbackTemplate)) return "Choose an active email template everyone will receive.";
    if (templateMode === "column" && !parsed?.columns.some((column) => column.originalLabel === routingColumn)) return "Choose a spreadsheet column, such as Industry.";
    if (templateMode === "column") {
      for (const value of routeValues) {
        const route = routeMap[value];
        if (!route) return `Choose a template or explicitly skip "${value}".`;
        if (route.action === "template" && !activeIds.has(route.templateId)) return `Choose an active template for "${value}" or skip those recipients.`;
        if (route.action === "fallback" && !activeIds.has(fallbackTemplate)) return "Choose a default template below. Any group set to Use default template needs one.";
      }
      if (fallbackTemplate && !activeIds.has(fallbackTemplate)) return "The default template is no longer available. Choose another template or remove the default.";
    }
    return "";
  }

  async function chooseFile(selected?: File) {
    if (!selected || pending) return;
    setPending(true);
    try {
      const result = await parseSpreadsheetFile(selected);
      if (!result.rows.length) throw new Error("This worksheet has no recipient rows. Choose a file with headers and at least one row.");
      setRoutingColumn(""); setRouteMap({}); setPlaceholderMap({}); setIssue(""); setFallbackTemplate(""); setTemplateMode("single"); setSubjectStrategy("template"); setFile(selected); setParsed(result); setMapping(autoMapping(result.columns)); setDatasetName(selected.name.replace(/\.(xlsx?|csv)$/i, "")); setStep(1);
    } catch (error) { setIssue(error instanceof Error ? error.message : "Could not read this file. Try another Excel or CSV file."); }
    finally { setPending(false); }
  }
  async function changeSheet(sheet: string) {
    if (!file) return; setPending(true);
    try { const result = await parseSpreadsheetFile(file, sheet); setParsed(result); setMapping(autoMapping(result.columns)); setRoutingColumn(""); setRouteMap({}); setPlaceholderMap({}); }
    catch (error) { setIssue(error instanceof Error ? error.message : "Could not read this worksheet."); }
    finally { setPending(false); }
  }
  function goNext() {
    setIssue("");
    if (step === 1 && setupIssue()) return setIssue(setupIssue());
    if (step === 2) {
      if (templateIssue()) return setIssue(templateIssue());
      setPlaceholderMap((current) => Object.fromEntries(requiredPlaceholders.map((placeholder) => [placeholder, current[placeholder] || (parsed ? suggestPlaceholderColumn(placeholder, parsed, mapping, routingColumn) : "")])));
    }
    if (step === 3 && missingFields.length) return setIssue("Connect these fields before continuing: " + missingFields.map((token) => "{{" + token + "}}").join(", "));
    setStep((value) => Math.min(value + 1, 4));
  }
  async function importDataset() {
    if (pending || !parsed || !file || !mapping.recipient_email || (templateMode === "single" ? !fallbackTemplate : !routingColumn)) return;
    if (setupIssue()) { setIssue(setupIssue()); setStep(1); return; }
    if (templateIssue()) { setIssue(templateIssue()); setStep(2); return; }
    if (missingFields.length) { setIssue("Connect every personalization field before saving."); setStep(3); return; }
    setPending(true); setIssue("");
    const supabase = getSupabaseBrowserClient(); let datasetId = "";
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) throw userError ?? new Error("Sign in again before importing.");
      const savedMapping = { ...mapping, subject: subjectStrategy === "template" ? "" : mapping.subject };
      const mappedRows = parsed.rows.map((row) => mapImportedRow(row, parsed.columns, { ...savedMapping, routing_key: templateMode === "column" ? routingColumn : "" }));
      const valid = mappedRows.filter((row) => row.email_valid).length; const missing = mappedRows.filter((row) => !row.recipient_email).length;
      const invalid = mappedRows.length - valid - missing;
      const { data: dataset, error: datasetError } = await supabase.from("datasets").insert({ user_id: user.id, name: datasetName.trim() || "Untitled spreadsheet", source_file_name: file.name, source_sheet_name: parsed.selectedSheet, row_count: mappedRows.length, valid_email_count: valid, missing_email_count: missing, invalid_email_count: invalid, fallback_template_id: fallbackTemplate || null, subject_strategy: subjectStrategy }).select("id").single();
      if (datasetError) throw datasetError; datasetId = dataset.id;
      const reverseMapping = Object.fromEntries(Object.entries(savedMapping).filter(([, value]) => value).map(([key, value]) => [value, key]));
      const { data: savedColumns, error: columnError } = await supabase.from("dataset_columns").insert(parsed.columns.map((column) => ({ user_id: user.id, dataset_id: dataset.id, original_label: column.originalLabel, placeholder_slug: column.slug, standard_field: reverseMapping[column.originalLabel] ?? null, display_order: column.index, data_type: "text" }))).select("id,original_label");
      if (columnError) throw columnError;
      const routingColumnId = savedColumns?.find((column) => column.original_label === (templateMode === "column" ? routingColumn : ""))?.id ?? null;
      if (routingColumnId) { const { error } = await supabase.from("datasets").update({ routing_column_id: routingColumnId }).eq("id", dataset.id); if (error) throw error; }
      for (let start = 0; start < mappedRows.length; start += 500) {
        const batch = mappedRows.slice(start, start + 500).map((row, offset) => ({ ...row, user_id: user.id, dataset_id: dataset.id, row_number: start + offset + 2 }));
        const { error } = await supabase.from("dataset_rows").insert(batch); if (error) throw error;
      }
      if (templateMode === "column" && routingColumn && routeValues.length) {
        const rules = routeValues.map((value) => { const route = routeMap[value]; const action = route?.action === "template" && !route.templateId ? "skip" : route?.action ?? "skip"; return { user_id: user.id, dataset_id: dataset.id, routing_value: value, normalized_value: normalizeRoutingValue(value), template_id: action === "template" ? route?.templateId : null, action }; });
        const { error } = await supabase.from("routing_rules").insert(rules); if (error) throw error;
      }
      const placeholderMappings = requiredPlaceholders.flatMap((placeholder) => {
        const originalLabel = placeholderMap[placeholder];
        const columnId = savedColumns?.find((column) => column.original_label === originalLabel)?.id;
        return columnId ? [{ user_id: user.id, dataset_id: dataset.id, placeholder, column_id: columnId }] : [];
      });
      if (placeholderMappings.length) {
        const { error } = await supabase.from("dataset_placeholder_mappings").insert(placeholderMappings); if (error) throw error;
      }
      toast.success(`${mappedRows.length.toLocaleString()} rows imported.`); router.push(`/datasets/${dataset.id}?tab=recipients`); router.refresh();
    } catch (error) {
      if (datasetId) await supabase.from("datasets").delete().eq("id", datasetId);
      setIssue(error instanceof Error ? error.message : "Import failed. Your choices are still here. Please try again."); setStep(4);
    } finally { setPending(false); }
  }
  function applyMappingProfile(profileId: string) {
    if (!parsed) return;
    setIssue("");
    if (!profileId) {
      setMapping(autoMapping(parsed.columns)); setRoutingColumn(""); setTemplateMode("single"); setFallbackTemplate(""); setRouteMap({}); setPlaceholderMap({}); setSubjectStrategy("template");
      return;
    }
    const profile = mappingProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    const labels = new Set(parsed.columns.map((column) => column.originalLabel));
    const routingKey = profile.routing_key_label && labels.has(profile.routing_key_label) ? profile.routing_key_label : "";
    setMapping(Object.fromEntries(Object.entries(profile.mappings).filter(([field, label]) => ["recipient_email", "subject"].includes(field) && labels.has(label))));
    setRoutingColumn(routingKey); setTemplateMode(profile.routing_key_label ? "column" : "single");
    setFallbackTemplate(profile.routing_rules?.__default?.templateId ?? "");
    const counts = new Map<string, number>();
    for (const row of parsed.rows) { const value = String(row[routingKey] ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }
    const groups = groupRoutingValues([...counts].map(([routing_value, row_count]) => ({ routing_value, row_count })));
    setRouteMap(Object.fromEntries(groups.map((group) => {
      const entry = Object.entries(profile.routing_rules ?? {}).find(([value]) => value !== "__default" && normalizeRoutingValue(value) === group.normalized_value)?.[1];
      return [group.routing_value, entry ?? { action: "skip", templateId: "" }];
    })));
    setPlaceholderMap(Object.fromEntries(Object.entries(profile.mappings).filter(([token, label]) => token.startsWith("field:") && labels.has(label)).map(([token, label]) => [token.slice(6), label])));
    setSubjectStrategy(profile.subject_strategy === "template" ? "template" : "spreadsheet_fallback");
    toast.success(`Applied ${profile.name}. Review the columns and template choices before continuing.`);
  }

  const examples = (label: string) => parsed?.rows.slice(0, 3).map((row) => String(row[label] ?? "") || "Empty").join(" · ");
  const emailValues = parsed?.rows.map((row) => String(row[mapping.recipient_email] ?? "").trim()) ?? [];
  const validCount = emailValues.filter(isValidEmail).length;
  const missingCount = emailValues.filter((value) => !value).length;
  const needsDefaultTemplate = templateMode === "column" && routeValues.some((value) => routeMap[value]?.action === "fallback");
  const templateOptions = templates.filter((template) => template.is_active && !template.is_archived).map((template) => <option key={template.id} value={template.id}>{template.name}</option>);
  const columnOptions = parsed?.columns.map((column) => <option key={column.slug} value={column.originalLabel}>{column.originalLabel}</option>);
  const completedSteps = [!!parsed?.rows.length, !!parsed && !setupIssue(), !!parsed && !templateIssue(), !!parsed && !templateIssue() && !missingFields.length, false].flatMap((ready, index) => ready ? [index] : []);
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted-foreground)]">Set up your spreadsheet first. Select recipients and send only after saving.</p><Badge tone="success">No emails sent during setup</Badge></div>
    <WorkflowSteps steps={steps} current={step} completed={completedSteps} disabled={steps.flatMap((_, index) => pending || index > step ? [index] : [])} onSelect={(index) => { if (!pending && index < step) { setStep(index); setIssue(""); } }} />
    {pending && step === 4 ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-4" role="status"><LoaderCircle className="animate-spin" /><h2 className="font-semibold">Saving your spreadsheet…</h2><p className="text-sm text-[var(--muted-foreground)]">Keep this page open. Nothing is being emailed.</p></CardContent></Card> : <>
    {step === 0 && parsed && <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{parsed.fileName}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{parsed.selectedSheet} · {parsed.rows.length.toLocaleString()} rows · Your current choices are kept.</p></div><Button disabled={pending} onClick={() => { setStep(1); setIssue(""); }}>Continue with this file<ArrowRight size={15} /></Button></CardContent></Card>}
    {step === 0 && <Card><CardContent className="space-y-6 py-8 text-left">
      <div><h2 className="text-xl font-semibold">Upload your spreadsheet</h2><p className="mt-3 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">Use a spreadsheet with a header row and recipient email addresses. Next, choose the email column and templates. You do not need to connect Microsoft yet.</p></div>
      <div className="rounded-lg border border-dashed bg-[var(--surface-hover)] p-5 sm:p-6">
        <label htmlFor="spreadsheet-file" className="block text-sm font-semibold">Choose an Excel or CSV file</label>
        <input ref={fileInput} id="spreadsheet-file" className="sr-only" tabIndex={-1} type="file" accept=".xlsx,.xls,.csv" disabled={pending} aria-describedby="spreadsheet-file-hint" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <div className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <Button variant="outline" disabled={pending} onClick={() => fileInput.current?.click()} className="shrink-0">{pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}{file ? "Choose another file" : "Choose file"}</Button>
          <div className="min-w-0"><p className="break-words text-sm font-medium">{file?.name ?? "No spreadsheet selected yet"}</p><p id="spreadsheet-file-hint" className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Excel (.xlsx, .xls) or CSV · up to 15 MB · 10,000 rows per worksheet</p></div>
        </div>
      </div>
      <Link className="inline-block text-sm font-semibold text-[var(--primary)] underline" href="/datasets/guide">Try a sample spreadsheet or see an example</Link>
      {pending && <p role="status" className="text-sm">Reading your file…</p>}
    </CardContent></Card>}
    {step === 1 && parsed && <Card><CardHeader><CardTitle>Email setup</CardTitle><p className="page-subtitle">Choose the recipient email column—the addresses your emails will go to. For example, “Public Email” supplies the To address. You will select individual rows after saving.</p></CardHeader><CardContent className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-semibold">{parsed.fileName} · {parsed.rows.length.toLocaleString()} rows</span>{parsed.sheetNames.length > 1 && <Select aria-label="Worksheet" className="w-60" value={parsed.selectedSheet} disabled={pending} onChange={(event) => changeSheet(event.target.value)}>{parsed.sheetNames.map((sheet) => <option key={sheet}>{sheet}</option>)}</Select>}</div>
      {mappingProfiles.length > 0 && <div><Label htmlFor="saved-setup">Reuse a saved setup (optional)</Label><Select id="saved-setup" defaultValue="" onChange={(event) => applyMappingProfile(event.target.value)}><option value="">Start a new setup</option>{mappingProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</Select></div>}
      <section aria-labelledby="recipient-emails-heading" className="space-y-3">
        <h3 id="recipient-emails-heading" className="text-sm font-semibold">Recipient emails</h3>
        <div><Label htmlFor="recipient-column">Which column contains the email address we should send to?</Label><Select id="recipient-column" value={mapping.recipient_email ?? ""} required onChange={(event) => { setMapping((current) => ({ ...current, recipient_email: event.target.value })); setIssue(""); }}><option value="">Choose recipient email column</option>{columnOptions}</Select>{mapping.recipient_email && <><p className="mt-2 break-words text-xs text-[var(--muted-foreground)]">Example recipient emails: {examples(mapping.recipient_email)}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone="success">{validCount} valid</Badge><Badge tone="warning">{missingCount} missing</Badge><Badge tone="danger">{emailValues.length - validCount - missingCount} invalid</Badge></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">Missing and invalid addresses can be fixed later. They will not be sent.</p></>}</div>
      </section>
      <details><summary className="cursor-pointer text-sm font-semibold">Preview spreadsheet</summary><div className="table-frame mt-3 max-h-80" role="region" aria-label="Spreadsheet preview, scroll for more columns" tabIndex={0}><table className="data-table w-full" style={{ minWidth: parsed.columns.length * 240 }}><colgroup>{parsed.columns.map((column) => <col key={column.slug} style={{ width: 240 }} />)}</colgroup><thead className="bg-[var(--muted)]"><tr>{parsed.columns.map((column) => <th className="p-3" key={column.slug}>{column.originalLabel}</th>)}</tr></thead><tbody>{parsed.previewRows.map((row, index) => <tr key={index} className="border-t">{parsed.columns.map((column) => <td className="break-words whitespace-normal" key={column.slug}>{String(row[column.originalLabel] ?? "") || "Empty"}</td>)}</tr>)}</tbody></table></div></details>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Subject options (optional)</summary>
        <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">The subject is the title a recipient sees in their inbox. Choose where that title comes from.</p>
        <div className="mt-4 space-y-4">
          <div><Label htmlFor="subject-source">Choose the subject type</Label><Select id="subject-source" aria-label="Subject source" value={subjectStrategy} onChange={(event) => { setSubjectStrategy(event.target.value === "template" ? "template" : "spreadsheet_fallback"); setIssue(""); }}><option value="template">Use template subjects only</option><option value="spreadsheet_fallback">Use spreadsheet subjects if available; otherwise use the template</option></Select>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{subjectStrategy === "template" ? "Every email uses the subject written in its chosen template. You do not need a subject column." : "Use each row’s subject from your spreadsheet. If that cell is blank, use the chosen template’s subject automatically."}</p>
          </div>
          {subjectStrategy === "spreadsheet_fallback" && <div><Label htmlFor="subject-column">Which spreadsheet column contains the subjects? (required)</Label><Select id="subject-column" aria-label="Spreadsheet subject column" required value={mapping.subject ?? ""} onChange={(event) => { setMapping((current) => ({ ...current, subject: event.target.value })); setIssue(""); }}><option value="">Choose subject column</option>{columnOptions}</Select>{mapping.subject && <p className="mt-2 break-words text-xs text-[var(--muted-foreground)]">Example subjects: {examples(mapping.subject)}</p>}</div>}
        </div>
      </details>
    </CardContent></Card>}
    {step === 2 && <Card><CardHeader><CardTitle>Choose templates</CardTitle><p className="page-subtitle">A template is the message you want to send. Use the same template for everyone, or choose different templates using a spreadsheet column.</p></CardHeader><CardContent className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">How to choose templates</legend>{[["single", "One template for everyone", "Send the same template to every recipient. Each email can still include their own details."], ["column", "Different templates by spreadsheet value", "For example, use the Industry column: Finance gets one template, Technology gets another."]].map(([value, title, copy]) => <label key={value} className={`min-w-0 cursor-pointer rounded-lg border p-4 ${templateMode === value ? "border-[var(--primary)] bg-[var(--accent)]" : ""}`}><span className="flex items-start gap-2"><input className="mt-1 shrink-0" type="radio" name="template-mode" value={value} checked={templateMode === value} onChange={() => { setTemplateMode(value as "single" | "column"); setFallbackTemplate(""); setIssue(""); }} /><span className="text-sm font-semibold">{title}</span></span><span className="mt-2 block text-xs leading-5 text-[var(--muted-foreground)]">{copy}</span></label>)}</fieldset>
      {!templates.length && <p role="alert" className="rounded-lg bg-[var(--muted)] p-3 text-sm">You need an active email template. <Link className="underline" href="/templates/new">Create one</Link> before continuing.</p>}
      {templateMode === "single" ? <div><Label htmlFor="everyone-template">Email template for everyone</Label><Select id="everyone-template" value={fallbackTemplate} onChange={(event) => setFallbackTemplate(event.target.value)}><option value="">Choose email template</option>{templateOptions}</Select></div> : <>
      <div><Label htmlFor="template-column">Which column should choose the template?</Label><Select id="template-column" value={routingColumn} required onChange={(event) => { const label = event.target.value; setIssue(""); setRoutingColumn(label); const counts = new Map<string, number>(); parsed?.rows.forEach((row) => { const value = String(row[label] ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }); const groups = groupRoutingValues([...counts].map(([routing_value, row_count]) => ({ routing_value, row_count }))); setRouteMap(Object.fromEntries(groups.map((group) => { const suggestion = suggestTemplate(group.routing_value, templates); return [group.routing_value, { action: suggestion ? "template" : "skip", templateId: suggestion?.id ?? "" }]; }))); }}><option value="">Choose a column, such as Industry</option>{columnOptions}</Select><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">We read each row’s value from this column. Suggestions match that value to a template’s category or name. You decide which template each group receives below.</p></div>
      {routingColumn && <>
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">For each spreadsheet value, skip these recipients, choose a specific template, or use one shared default template. Suggestions are not confirmed until you save. Values with no match start as skipped.</p>
        <div className="divide-y rounded-lg border">{routeValues.map((value) => {
          const action = routeMap[value]?.action ?? "skip";
          return <div key={value} className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,210px)_minmax(0,1fr)]">
            <div className="break-words text-sm font-semibold">{value}<span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">{parsed?.rows.filter((row) => normalizeRoutingValue(row[routingColumn]) === normalizeRoutingValue(value)).length} recipients</span></div>
            <Select aria-label={`Action for ${value}`} value={action} onChange={(event) => { setIssue(""); setRouteMap((current) => ({ ...current, [value]: { ...current[value], action: event.target.value as "template" | "fallback" | "skip", templateId: current[value]?.templateId ?? "" } })); }}><option value="skip">Skip these recipients</option><option value="template">Choose a template</option><option value="fallback">Use default template</option></Select>
            {action === "template" ? <Select aria-label={`Email template for ${value}`} required value={routeMap[value]?.templateId ?? ""} onChange={(event) => { setIssue(""); setRouteMap((current) => ({ ...current, [value]: { action: "template", templateId: event.target.value } })); }}><option value="">Choose email template</option>{templateOptions}</Select> : <p className="self-center break-words text-xs leading-5 text-[var(--muted-foreground)]">{action === "skip" ? "No email will be sent to these recipients." : fallbackTemplate ? `Default: ${templates.find((template) => template.id === fallbackTemplate)?.name ?? "Choose an available template below"}` : "Choose the required default template below."}</p>}
          </div>;
        })}</div>
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">{parsed?.rows.filter((row) => !String(row[routingColumn] ?? "").trim()).length} rows have no value in this column. {fallbackTemplate ? "They use the default template below." : "They are left out unless you choose a default template below."} A default never overrides “Skip these recipients”.</p>
      </>}
      {routingColumn && <div className="rounded-lg border bg-[var(--surface-hover)] p-4"><Label htmlFor="default-email">Default template {needsDefaultTemplate ? "(required)" : "(optional)"}</Label><Select id="default-email" required={needsDefaultTemplate} aria-describedby="default-template-hint" value={fallbackTemplate} onChange={(event) => { setFallbackTemplate(event.target.value); setIssue(""); }}><option value="">{needsDefaultTemplate ? "Choose a default template to continue" : "No default — leave unmatched recipients out"}</option>{templateOptions}</Select><p id="default-template-hint" className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{needsDefaultTemplate ? "Required because at least one group uses “Use default template”. Every such group will use this template." : "Only needed if you want a shared template for rows with missing or unmatched values."} Groups explicitly marked Skip are always left out.</p></div>}
      </>}
    </CardContent></Card>}
    {step === 3 && parsed && <Card><CardHeader><CardTitle>Personalize your emails</CardTitle><p className="page-subtitle">Fill the blanks in your templates using your spreadsheet. For each field, choose the column that has the right information. For example, connect {"{{company_name}}"} to Business Name to turn “Hi {"{{company_name}}"}” into “Hi Northstar Labs”. Your signature comes from Settings.</p></CardHeader><CardContent className="space-y-4">
      {requiredPlaceholders.length ? requiredPlaceholders.map((placeholder) => <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" key={placeholder}><div><span className="flex items-center gap-2 text-sm font-semibold"><Braces size={16} />{placeholder.replaceAll("_", " ")}</span><code className="mt-1 block text-xs text-[var(--primary)]">{`{{${placeholder}}}`}</code><p className="mt-2 text-xs text-[var(--muted-foreground)]">{selectedTemplates.filter((template) => (template.subject_template + template.html_body + template.plain_text_body).includes(placeholder)).map((template) => template.name).join(", ")}</p></div><div><Select aria-label={`Spreadsheet column for ${placeholder}`} value={placeholderMap[placeholder] ?? ""} onChange={(event) => setPlaceholderMap((current) => ({ ...current, [placeholder]: event.target.value }))}><option value="">Choose spreadsheet column</option>{columnOptions}</Select><p className="mt-2 text-xs text-[var(--muted-foreground)]">{placeholderMap[placeholder] ? `Example result: ${examples(placeholderMap[placeholder])}` : "Choose a column to continue. Blank values in individual rows can be fixed after saving."}</p></div></div>) : <div className="rounded-xl bg-[var(--muted)] p-5 text-sm">No spreadsheet fields are needed for these emails. You can continue.</div>}
    </CardContent></Card>}
    {step === 4 && parsed && <Card><CardHeader><CardTitle>Save your spreadsheet</CardTitle><p className="page-subtitle">Check your setup and save. Next, select recipient rows, preview the finished emails, and confirm a separate send.</p></CardHeader><CardContent className="space-y-5">
      <div><Label htmlFor="spreadsheet-name">Spreadsheet name</Label><Input id="spreadsheet-name" value={datasetName} onChange={(event) => setDatasetName(event.target.value)} /></div>
      <dl className="grid gap-4 rounded-xl bg-[var(--muted)] p-5 sm:grid-cols-2">{[
        ["Source file / worksheet", parsed.fileName + " / " + parsed.selectedSheet],
        ["Imported rows", parsed.rows.length.toLocaleString()],
        ["Recipient email column", mapping.recipient_email],
        ["Email quality", validCount + " valid · " + missingCount + " missing · " + (emailValues.length - validCount - missingCount) + " invalid"],
        ["Template selection", templateMode === "single" ? "One template for everyone" : "Values from " + routingColumn],
        ["Templates used", selectedTemplates.map((template) => template.name).join(", ") || "All groups are skipped"],
        ["Personalization", (requiredPlaceholders.length - missingFields.length) + " of " + requiredPlaceholders.length + " columns connected"],
        ["Subject source", subjectStrategy === "template" ? "Template subjects only" : mapping.subject + " — blank cells use the template subject"],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Review personalization columns</summary><div className="mt-3 space-y-2">{requiredPlaceholders.length ? requiredPlaceholders.map((token) => <div key={token} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-hover)] p-3 text-sm"><code>{"{{" + token + "}}"}</code><span>{placeholderMap[token] || "Not connected"}</span></div>) : <p className="text-sm text-[var(--muted-foreground)]">These templates do not need spreadsheet personalization fields.</p>}</div></details>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]"><CheckCircle2 size={17} />What happens after saving?</div><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">You will open Select recipients. Tick the rows to contact, preview each email, then use Review &amp; send. Saving this spreadsheet does not send an email.</p></div>
      {validCount < emailValues.length && <p className="rounded-lg bg-[var(--muted)] p-3 text-sm">Rows with missing or invalid addresses will be saved, but cannot be emailed until corrected in Select recipients.</p>}
      {templateMode === "column" && <p className="rounded-lg bg-[var(--muted)] p-3 text-sm">{routeValues.filter((value) => routeMap[value]?.action === "skip").length} spreadsheet groups are marked Skip. A default template does not override an explicit Skip.</p>}
    </CardContent></Card>}
    {issue && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--danger)]"><AlertCircle size={18} className="shrink-0" />{issue}</div>}
    {step > 0 && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--card)] p-4"><Button variant="outline" disabled={pending} onClick={() => { setStep((value) => value - 1); setIssue(""); }}><ArrowLeft size={15} />Back</Button><span className="hidden text-xs text-[var(--muted-foreground)] sm:block">Choices stay here when you go back.</span>{step < 4 ? <Button disabled={pending} onClick={goNext}>Continue<ArrowRight size={15} /></Button> : <Button disabled={pending || !datasetName.trim()} onClick={importDataset}><FileSpreadsheet size={15} />Save and select recipients</Button>}</div>}
    </>}
  </div>;
}
