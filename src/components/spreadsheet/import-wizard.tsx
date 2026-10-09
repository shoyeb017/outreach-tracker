"use client";

import { useEffect, useMemo, useState } from "react";
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

export function ImportWizard({ templates, mappingProfiles = [], keepOriginalDefault = false }: { templates: EmailTemplate[]; mappingProfiles?: MappingProfile[]; keepOriginalDefault?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0); const [file, setFile] = useState<File | null>(null); const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); const [routingColumn, setRoutingColumn] = useState("");
  const [templateMode, setTemplateMode] = useState<"single" | "column">("single");
  const [issue, setIssue] = useState("");
  const [routeMap, setRouteMap] = useState<Record<string, { action: "template" | "fallback" | "skip"; templateId: string }>>({});
  const [placeholderMap, setPlaceholderMap] = useState<Record<string, string>>({});
  const [datasetName, setDatasetName] = useState(""); const [subjectStrategy, setSubjectStrategy] = useState<SubjectStrategy>("template");
  const [fallbackTemplate, setFallbackTemplate] = useState(""); const [keepOriginal, setKeepOriginal] = useState(keepOriginalDefault);
  const [saveProfile, setSaveProfile] = useState(false); const [profileName, setProfileName] = useState(""); const [pending, setPending] = useState(false);

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
    if (mapping.subject && mapping.subject === mapping.recipient_email) return "Email addresses and subjects must use different columns.";
    if (subjectStrategy === "spreadsheet" && !mapping.subject) return "Choose a spreadsheet subject column or use template subjects.";
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
        if (route.action === "fallback" && !activeIds.has(fallbackTemplate)) return "Choose an active default template before using it for a group.";
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
    if (saveProfile && !profileName.trim()) return setIssue("Give your saved setup a name, or turn off saving a setup.");
    setPending(true); setIssue("");
    const supabase = getSupabaseBrowserClient(); let datasetId = ""; let uploadedPath = "";
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) throw userError ?? new Error("Sign in again before importing.");
      const mappedRows = parsed.rows.map((row) => mapImportedRow(row, parsed.columns, { ...mapping, routing_key: templateMode === "column" ? routingColumn : "" }));
      const valid = mappedRows.filter((row) => row.email_valid).length; const missing = mappedRows.filter((row) => !row.recipient_email).length;
      const invalid = mappedRows.length - valid - missing;
      const { data: dataset, error: datasetError } = await supabase.from("datasets").insert({ user_id: user.id, name: datasetName.trim() || "Untitled spreadsheet", source_file_name: file.name, source_sheet_name: parsed.selectedSheet, row_count: mappedRows.length, valid_email_count: valid, missing_email_count: missing, invalid_email_count: invalid, fallback_template_id: fallbackTemplate || null, subject_strategy: subjectStrategy }).select("id").single();
      if (datasetError) throw datasetError; datasetId = dataset.id;
      const reverseMapping = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value).map(([key, value]) => [value, key]));
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
      if (saveProfile && profileName.trim()) {
        const { error } = await supabase.from("column_mapping_profiles").insert({ user_id: user.id, name: profileName.trim(), source_columns: parsed.columns.map((column) => column.originalLabel), mappings: { ...mapping, ...Object.fromEntries(Object.entries(placeholderMap).filter(([, label]) => label).map(([token, label]) => ["field:" + token, label])) }, routing_key_label: templateMode === "column" ? routingColumn : null, routing_rules: { ...routeMap, __default: { action: "fallback", templateId: fallbackTemplate } }, subject_strategy: subjectStrategy });
        if (error) throw error;
      }
      if (keepOriginal) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const path = `${user.id}/${dataset.id}/${safeName}`;
        const { error } = await supabase.storage.from("imports").upload(path, file, { upsert: false }); if (error) throw error; uploadedPath = path;
        const { error: updateError } = await supabase.from("datasets").update({ original_file_path: path }).eq("id", dataset.id); if (updateError) throw updateError;
      }
      toast.success(`${mappedRows.length.toLocaleString()} rows imported.`); router.push(`/datasets/${dataset.id}?tab=recipients`); router.refresh();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from("imports").remove([uploadedPath]);
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
    setSubjectStrategy(profile.subject_strategy);
    toast.success(`Applied ${profile.name}. Review the columns and template choices before continuing.`);
  }

  const examples = (label: string) => parsed?.rows.slice(0, 3).map((row) => String(row[label] ?? "") || "Empty").join(" · ");
  const emailValues = parsed?.rows.map((row) => String(row[mapping.recipient_email] ?? "").trim()) ?? [];
  const validCount = emailValues.filter(isValidEmail).length;
  const missingCount = emailValues.filter((value) => !value).length;
  const templateOptions = templates.filter((template) => template.is_active && !template.is_archived).map((template) => <option key={template.id} value={template.id}>{template.name}</option>);
  const columnOptions = parsed?.columns.map((column) => <option key={column.slug} value={column.originalLabel}>{column.originalLabel}</option>);
  const completedSteps = [!!parsed?.rows.length, !!parsed && !setupIssue(), !!parsed && !templateIssue(), !!parsed && !templateIssue() && !missingFields.length, false].flatMap((ready, index) => ready ? [index] : []);
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted-foreground)]">Set up your spreadsheet first. Select recipients and send only after saving.</p><Badge tone="success">No emails sent during setup</Badge></div>
    <WorkflowSteps steps={steps} current={step} completed={completedSteps} disabled={steps.flatMap((_, index) => pending || index > step ? [index] : [])} onSelect={(index) => { if (!pending && index < step) { setStep(index); setIssue(""); } }} />
    {pending && step === 4 ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-4" role="status"><LoaderCircle className="animate-spin" /><h2 className="font-semibold">Saving your spreadsheet…</h2><p className="text-sm text-[var(--muted-foreground)]">Keep this page open. Nothing is being emailed.</p></CardContent></Card> : <>
    {step === 0 && parsed && <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{parsed.fileName}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{parsed.selectedSheet} · {parsed.rows.length.toLocaleString()} rows · Your current choices are kept.</p></div><Button disabled={pending} onClick={() => { setStep(1); setIssue(""); }}>Continue with this file<ArrowRight size={15} /></Button></CardContent></Card>}
    {step === 0 && <Card><CardContent className="space-y-6 py-10 text-left"><UploadCloud size={36} className="mx-auto text-[var(--primary)]" /><div><h2 className="text-2xl font-semibold">Upload your spreadsheet</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">Use a spreadsheet with a header row and contact email addresses. We will help you choose the correct columns and email templates. Microsoft is not needed to create a spreadsheet.</p></div><label className="block"><span className="mb-2 block text-sm font-semibold">Choose an Excel or CSV file</span><Input className="mx-auto max-w-md" type="file" accept=".xlsx,.xls,.csv" disabled={pending} onChange={(event) => chooseFile(event.target.files?.[0])} /></label><p className="text-xs text-[var(--muted-foreground)]">Excel (.xlsx, .xls) or CSV · up to 15 MB · 10,000 rows per worksheet</p><Link className="inline-block text-sm font-semibold text-[var(--primary)] underline" href="/datasets/guide">Try a sample spreadsheet or see an example</Link>{pending && <p role="status">Reading your file…</p>}</CardContent></Card>}
    {step === 1 && parsed && <Card><CardHeader><CardTitle>Email setup</CardTitle><p className="page-subtitle">Choose where emails go. “Public Email”, for example, supplies the To address. You will select individual rows after saving.</p></CardHeader><CardContent className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-semibold">{parsed.fileName} · {parsed.rows.length.toLocaleString()} rows</span>{parsed.sheetNames.length > 1 && <Select aria-label="Worksheet" className="w-60" value={parsed.selectedSheet} disabled={pending} onChange={(event) => changeSheet(event.target.value)}>{parsed.sheetNames.map((sheet) => <option key={sheet}>{sheet}</option>)}</Select>}</div>
      {mappingProfiles.length > 0 && <div><Label htmlFor="saved-setup">Reuse a saved setup (optional)</Label><Select id="saved-setup" defaultValue="" onChange={(event) => applyMappingProfile(event.target.value)}><option value="">Start a new setup</option>{mappingProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</Select></div>}
      <div><Label htmlFor="recipient-column">Which column contains the email address we should send to?</Label><Select id="recipient-column" value={mapping.recipient_email ?? ""} onChange={(event) => { setMapping((current) => ({ ...current, recipient_email: event.target.value })); setIssue(""); }}><option value="">Choose email column</option>{columnOptions}</Select>{mapping.recipient_email && <><p className="mt-2 text-xs text-[var(--muted-foreground)]">Example addresses: {examples(mapping.recipient_email)}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone="success">{validCount} valid</Badge><Badge tone="warning">{missingCount} missing</Badge><Badge tone="danger">{emailValues.length - validCount - missingCount} invalid</Badge></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">Missing and invalid addresses can be fixed later. They will not be sent.</p></>}</div>
      <details><summary className="cursor-pointer text-sm font-semibold">Preview spreadsheet</summary><div className="table-frame mt-3 max-h-80" role="region" aria-label="Spreadsheet preview, scroll for more columns" tabIndex={0}><table className="data-table w-full" style={{ minWidth: parsed.columns.length * 240 }}><colgroup>{parsed.columns.map((column) => <col key={column.slug} style={{ width: 240 }} />)}</colgroup><thead className="bg-[var(--muted)]"><tr>{parsed.columns.map((column) => <th className="p-3" key={column.slug}>{column.originalLabel}</th>)}</tr></thead><tbody>{parsed.previewRows.map((row, index) => <tr key={index} className="border-t">{parsed.columns.map((column) => <td className="break-words whitespace-normal" key={column.slug}>{String(row[column.originalLabel] ?? "") || "Empty"}</td>)}</tr>)}</tbody></table></div></details>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Subject options (optional)</summary><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">Use the template subject by default. Change this only if your spreadsheet already contains complete subject lines.</p><div className="mt-4 space-y-4"><div><Label>Spreadsheet subject column (optional)</Label><Select aria-label="Spreadsheet subject column" value={mapping.subject ?? ""} onChange={(event) => setMapping((current) => ({ ...current, subject: event.target.value }))}><option value="">Use template subjects</option>{columnOptions}</Select></div><div><Label>Choose the subject</Label><Select aria-label="Subject source" value={subjectStrategy} onChange={(event) => setSubjectStrategy(event.target.value as SubjectStrategy)}><option value="template">Use the template subject</option><option value="spreadsheet_fallback">Use spreadsheet subject when available</option><option value="spreadsheet">Use spreadsheet subject only</option></Select></div></div></details>
    </CardContent></Card>}
    {step === 2 && <Card><CardHeader><CardTitle>Choose templates</CardTitle><p className="page-subtitle">Choose one email for everyone, or use a column such as Industry to send different emails.</p></CardHeader><CardContent className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">How to choose emails</legend>{[["single", "One email for everyone", "A simple choice for a single message."], ["column", "Different emails by spreadsheet value", "For example: Finance → finance email."]].map(([value, title, copy]) => <label key={value} className={`cursor-pointer rounded-xl border p-4 ${templateMode === value ? "border-[var(--border)] bg-[var(--muted)]" : ""}`}><input type="radio" name="template-mode" value={value} checked={templateMode === value} onChange={() => { setTemplateMode(value as "single" | "column"); setFallbackTemplate(""); setIssue(""); }} /><span className="ml-2 text-sm font-semibold">{title}</span><span className="mt-2 block text-xs text-[var(--muted-foreground)]">{copy}</span></label>)}</fieldset>
      {!templates.length && <p role="alert" className="rounded-lg bg-[var(--muted)] p-3 text-sm">You need an active email template. <Link className="underline" href="/templates/new">Create one</Link> before continuing.</p>}
      {templateMode === "single" ? <div><Label htmlFor="everyone-template">Email template for everyone</Label><Select id="everyone-template" value={fallbackTemplate} onChange={(event) => setFallbackTemplate(event.target.value)}><option value="">Choose email template</option>{templateOptions}</Select></div> : <>
      <div><Label htmlFor="template-column">Use this spreadsheet column to choose the email</Label><Select id="template-column" value={routingColumn} onChange={(event) => { const label = event.target.value; setRoutingColumn(label); const counts = new Map<string, number>(); parsed?.rows.forEach((row) => { const value = String(row[label] ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }); const groups = groupRoutingValues([...counts].map(([routing_value, row_count]) => ({ routing_value, row_count }))); setRouteMap(Object.fromEntries(groups.map((group) => { const suggestion = suggestTemplate(group.routing_value, templates); return [group.routing_value, { action: suggestion ? "template" : "skip", templateId: suggestion?.id ?? "" }]; }))); }}><option value="">Choose a column, such as Industry</option>{columnOptions}</Select></div>
      {routingColumn && <><p className="text-xs text-[var(--muted-foreground)]">Exact category or name matches are suggested below. Confirm your choices. Unmatched values start as skipped.</p><div className="divide-y rounded-lg border">{routeValues.map((value) => <div key={value} className="grid gap-3 p-4 sm:grid-cols-[1fr_150px_1fr]"><div className="text-sm font-semibold">{value}<span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">{parsed?.rows.filter((row) => normalizeRoutingValue(row[routingColumn]) === normalizeRoutingValue(value)).length} recipients</span></div><Select aria-label={`Action for ${value}`} value={routeMap[value]?.action ?? "skip"} onChange={(event) => setRouteMap((current) => ({ ...current, [value]: { ...current[value], action: event.target.value as "template" | "fallback" | "skip", templateId: current[value]?.templateId ?? "" } }))}><option value="template">Choose email</option><option value="fallback">Use default email</option><option value="skip">Skip recipients</option></Select><Select aria-label={`Email template for ${value}`} disabled={routeMap[value]?.action !== "template"} value={routeMap[value]?.templateId ?? ""} onChange={(event) => setRouteMap((current) => ({ ...current, [value]: { action: "template", templateId: event.target.value } }))}><option value="">Choose email template</option>{templateOptions}</Select></div>)}</div><p className="text-xs text-[var(--muted-foreground)]">{parsed?.rows.filter((row) => !String(row[routingColumn] ?? "").trim()).length} rows have no value in this column; they use the default email below or are blocked.</p></>}
      <div><Label htmlFor="default-email">Default email for unmatched values (optional)</Label><Select id="default-email" value={fallbackTemplate} onChange={(event) => setFallbackTemplate(event.target.value)}><option value="">No default — leave unmatched recipients out</option>{templateOptions}</Select></div>
      </>}
    </CardContent></Card>}
    {step === 3 && parsed && <Card><CardHeader><CardTitle>Personalize your emails</CardTitle><p className="page-subtitle">Connect each email field to a spreadsheet column. For example, {"{{company_name}}"} + Business Name becomes “Northstar Labs”. Your signature comes from Settings.</p></CardHeader><CardContent className="space-y-4">
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
        ["Subject source", subjectStrategy === "template" ? "Template subject" : subjectStrategy === "spreadsheet" ? "Only " + mapping.subject : mapping.subject ? mapping.subject + ", otherwise template subject" : "Template subject (no spreadsheet subject column)"],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Review personalization columns</summary><div className="mt-3 space-y-2">{requiredPlaceholders.length ? requiredPlaceholders.map((token) => <div key={token} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-hover)] p-3 text-sm"><code>{"{{" + token + "}}"}</code><span>{placeholderMap[token] || "Not connected"}</span></div>) : <p className="text-sm text-[var(--muted-foreground)]">These templates do not need spreadsheet personalization fields.</p>}</div></details>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]"><CheckCircle2 size={17} />What happens after saving?</div><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">You will open Select recipients. Tick the rows to contact, preview each email, then use Review &amp; send. Saving this spreadsheet does not send an email.</p></div>
      {validCount < emailValues.length && <p className="rounded-lg bg-[var(--muted)] p-3 text-sm">Rows with missing or invalid addresses will be saved, but cannot be emailed until corrected in Select recipients.</p>}
      {templateMode === "column" && <p className="rounded-lg bg-[var(--muted)] p-3 text-sm">{routeValues.filter((value) => routeMap[value]?.action === "skip").length} spreadsheet groups are marked Skip. A default template does not override an explicit Skip.</p>}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Optional: keep the file or reuse this setup</summary><div className="mt-4 space-y-4"><label className="block text-sm"><input type="checkbox" checked={keepOriginal} onChange={(event) => setKeepOriginal(event.target.checked)} /> Keep a private copy of the original file</label><label className="block text-sm"><input type="checkbox" checked={saveProfile} onChange={(event) => setSaveProfile(event.target.checked)} /> Save these choices for future spreadsheets</label>{saveProfile && <Input aria-label="Saved setup name" value={profileName} placeholder="Example: Monthly contacts" onChange={(event) => setProfileName(event.target.value)} />}</div></details>
    </CardContent></Card>}
    {issue && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--danger)]"><AlertCircle size={18} className="shrink-0" />{issue}</div>}
    {step > 0 && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--card)] p-4"><Button variant="outline" disabled={pending} onClick={() => { setStep((value) => value - 1); setIssue(""); }}><ArrowLeft size={15} />Back</Button><span className="hidden text-xs text-[var(--muted-foreground)] sm:block">Choices stay here when you go back.</span>{step < 4 ? <Button disabled={pending} onClick={goNext}>Continue<ArrowRight size={15} /></Button> : <Button disabled={pending || !datasetName.trim()} onClick={importDataset}><FileSpreadsheet size={15} />Save and select recipients</Button>}</div>}
    </>}
  </div>;
}
