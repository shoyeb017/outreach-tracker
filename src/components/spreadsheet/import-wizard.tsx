"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Braces, Check, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
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

const steps = ["Choose file", "Preview", "Required setup", "Template routing", "Placeholders", "Review", "Import"];
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
  const [routeMap, setRouteMap] = useState<Record<string, { action: "template" | "fallback" | "skip"; templateId: string }>>({});
  const [placeholderMap, setPlaceholderMap] = useState<Record<string, string>>({});
  const [datasetName, setDatasetName] = useState(""); const [subjectStrategy, setSubjectStrategy] = useState<SubjectStrategy>("spreadsheet_fallback");
  const [fallbackTemplate, setFallbackTemplate] = useState(""); const [keepOriginal, setKeepOriginal] = useState(keepOriginalDefault);
  const [saveProfile, setSaveProfile] = useState(false); const [profileName, setProfileName] = useState(""); const [pending, setPending] = useState(false);

  const routeValues = useMemo(() => {
    if (!parsed || !routingColumn) return [];
    const counts = new Map<string, number>();
    for (const row of parsed.rows) { const value = String(row[routingColumn] ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }
    return groupRoutingValues(Array.from(counts, ([routing_value, row_count]) => ({ routing_value, row_count }))).map((group) => group.routing_value);
  }, [parsed, routingColumn]);
  const selectedTemplates = useMemo(() => {
    const ids = new Set(Object.values(routeMap).filter((route) => route.action === "template" && route.templateId).map((route) => route.templateId));
    if (fallbackTemplate) ids.add(fallbackTemplate);
    return templates.filter((template) => ids.has(template.id));
  }, [fallbackTemplate, routeMap, templates]);
  const requiredPlaceholders = useMemo(() => dataPlaceholdersForTemplates(selectedTemplates), [selectedTemplates]);

  async function chooseFile(selected?: File) {
    if (!selected) return;
    setPending(true);
    try {
      const result = await parseSpreadsheetFile(selected);
      setFile(selected); setParsed(result); setMapping(autoMapping(result.columns)); setDatasetName(selected.name.replace(/\.(xlsx?|csv)$/i, "")); setStep(1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read this file."); }
    finally { setPending(false); }
  }
  async function changeSheet(sheet: string) {
    if (!file) return; setPending(true);
    try { const result = await parseSpreadsheetFile(file, sheet); setParsed(result); setMapping(autoMapping(result.columns)); setRoutingColumn(""); setRouteMap({}); setPlaceholderMap({}); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not read this worksheet."); }
    finally { setPending(false); }
  }
  function configureRouting() {
    const next: typeof routeMap = {};
    routeValues.forEach((value) => {
      const suggestion = suggestTemplate(value, templates);
      next[value] = routeMap[value] ?? { action: suggestion ? "template" : "skip", templateId: suggestion?.id ?? "" };
    });
    setRouteMap(next);
  }
  function goNext() {
    if (step === 1 && !parsed?.rows.length) return toast.error("This worksheet has no data rows.");
    if (step === 2 && !mapping.recipient_email) return toast.error("Choose the spreadsheet column containing recipient emails.");
    if (step === 2 && !routingColumn) return toast.error("Choose the spreadsheet column/key that selects templates.");
    if (step === 2) configureRouting();
    if (step === 3) {
      const incomplete = routeValues.find((value) => routeMap[value]?.action === "template" && !routeMap[value]?.templateId);
      if (incomplete) return toast.error(`Choose a template for "${incomplete}" or change it to Skip.`);
      setPlaceholderMap((current) => Object.fromEntries(requiredPlaceholders.map((placeholder) => [placeholder, current[placeholder] || (parsed ? suggestPlaceholderColumn(placeholder, parsed, mapping, routingColumn) : "")])));
    }
    setStep((value) => Math.min(value + 1, 5));
  }
  async function importDataset() {
    if (!parsed || !file || !mapping.recipient_email || !routingColumn) return;
    setStep(6); setPending(true);
    const supabase = getSupabaseBrowserClient(); let datasetId = "";
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) throw userError ?? new Error("Sign in again before importing.");
      const mappedRows = parsed.rows.map((row) => mapImportedRow(row, parsed.columns, { ...mapping, routing_key: routingColumn }));
      const valid = mappedRows.filter((row) => row.email_valid).length; const missing = mappedRows.filter((row) => !row.recipient_email).length;
      const invalid = mappedRows.length - valid - missing;
      const { data: dataset, error: datasetError } = await supabase.from("datasets").insert({ user_id: user.id, name: datasetName.trim() || "Untitled dataset", source_file_name: file.name, source_sheet_name: parsed.selectedSheet, row_count: mappedRows.length, valid_email_count: valid, missing_email_count: missing, invalid_email_count: invalid, fallback_template_id: fallbackTemplate || null, subject_strategy: subjectStrategy }).select("id").single();
      if (datasetError) throw datasetError; datasetId = dataset.id;
      const reverseMapping = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value).map(([key, value]) => [value, key]));
      const { data: savedColumns, error: columnError } = await supabase.from("dataset_columns").insert(parsed.columns.map((column) => ({ user_id: user.id, dataset_id: dataset.id, original_label: column.originalLabel, placeholder_slug: column.slug, standard_field: reverseMapping[column.originalLabel] ?? null, display_order: column.index, data_type: "text" }))).select("id,original_label");
      if (columnError) throw columnError;
      const routingColumnId = savedColumns?.find((column) => column.original_label === routingColumn)?.id ?? null;
      if (routingColumnId) { const { error } = await supabase.from("datasets").update({ routing_column_id: routingColumnId }).eq("id", dataset.id); if (error) throw error; }
      for (let start = 0; start < mappedRows.length; start += 500) {
        const batch = mappedRows.slice(start, start + 500).map((row, offset) => ({ ...row, user_id: user.id, dataset_id: dataset.id, row_number: start + offset + 2 }));
        const { error } = await supabase.from("dataset_rows").insert(batch); if (error) throw error;
      }
      if (routingColumn && routeValues.length) {
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
        const { error } = await supabase.from("column_mapping_profiles").insert({ user_id: user.id, name: profileName.trim(), source_columns: parsed.columns.map((column) => column.originalLabel), mappings: mapping, routing_key_label: routingColumn || null, routing_rules: routeMap, subject_strategy: subjectStrategy });
        if (error) throw error;
      }
      if (keepOriginal) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const path = `${user.id}/${dataset.id}/${safeName}`;
        const { error } = await supabase.storage.from("imports").upload(path, file, { upsert: false }); if (error) throw error;
        const { error: updateError } = await supabase.from("datasets").update({ original_file_path: path }).eq("id", dataset.id); if (updateError) throw updateError;
      }
      toast.success(`${mappedRows.length.toLocaleString()} rows imported.`); router.push(`/datasets/${dataset.id}`); router.refresh();
    } catch (error) {
      if (datasetId) await supabase.from("datasets").delete().eq("id", datasetId);
      toast.error(error instanceof Error ? error.message : "Import failed."); setStep(5);
    } finally { setPending(false); }
  }
  function applyMappingProfile(profileId: string) { const profile = mappingProfiles.find((item) => item.id === profileId); if (!profile || !parsed) return; const labels = new Set(parsed.columns.map((column) => column.originalLabel)); setMapping(Object.fromEntries(Object.entries(profile.mappings).filter(([field, label]) => ["recipient_email", "subject"].includes(field) && labels.has(label)))); setRoutingColumn(profile.routing_key_label && labels.has(profile.routing_key_label) ? profile.routing_key_label : ""); setRouteMap(profile.routing_rules ?? {}); setPlaceholderMap({}); setSubjectStrategy(profile.subject_strategy); toast.success(`Applied ${profile.name}. Review the required columns and template matches.`); }

  return <div><div className="mb-6 overflow-x-auto"><div className="flex min-w-[720px] items-center">{steps.map((label, index) => <div className="flex flex-1 items-center" key={label}><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${index < step ? "bg-[#176b55] text-white" : index === step ? "border-2 border-[#176b55] bg-white text-[#176b55]" : "bg-[#e9edeb] text-[#7a8581]"}`}>{index < step ? <Check size={13} /> : index + 1}</span><span className={`text-xs font-semibold ${index === step ? "text-[#17201e]" : "text-[#7a8581]"}`}>{label}</span></div>{index < steps.length - 1 && <div className="mx-3 h-px flex-1 bg-[#dfe5e2]" />}</div>)}</div></div>
    {step === 2 && mappingProfiles.length > 0 && <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-3 py-4"><div className="mr-auto"><div className="text-sm font-semibold">Use a saved mapping</div><div className="mt-1 text-xs text-[#7a8581]">Matching source headers are applied; you still review the result.</div></div><Select className="w-72" defaultValue="" onChange={(event) => { applyMappingProfile(event.target.value); event.target.value = ""; }}><option value="">Choose mapping profile</option>{mappingProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</Select></CardContent></Card>}
    {step === 0 && <Card className="border-dashed"><CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f3ee] text-[#176b55]"><UploadCloud size={24} /></span><h2 className="mt-5 text-xl font-semibold">Choose an Excel or CSV file</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#68736f]">The file stays in your browser until you preview, map, and approve the import. Maximum 15 MB and 10,000 rows per worksheet.</p><Label className="mt-6"><span className="sr-only">Choose spreadsheet</span><Input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => chooseFile(event.target.files?.[0])} /><span className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#176b55] px-5 text-sm font-semibold text-white">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}Browse files</span></Label></CardContent></Card>}
    {step === 1 && parsed && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{parsed.fileName}</CardTitle><p className="mt-1 text-xs text-[#7a8581]">{parsed.analysis.totalRows.toLocaleString()} rows · {parsed.columns.length} columns</p></div>{parsed.sheetNames.length > 1 && <Select className="w-60" value={parsed.selectedSheet} onChange={(event) => changeSheet(event.target.value)}>{parsed.sheetNames.map((sheet) => <option key={sheet}>{sheet}</option>)}</Select>}</div></CardHeader><CardContent><div className="mb-4 flex flex-wrap gap-2"><Badge tone="success">{parsed.analysis.potentialEmails} email-like values</Badge>{parsed.analysis.invalidEmails > 0 && <Badge tone="danger">{parsed.analysis.invalidEmails} invalid</Badge>}{parsed.analysis.duplicateRows > 0 && <Badge tone="warning">{parsed.analysis.duplicateRows} duplicate rows</Badge>}<Badge>{parsed.analysis.missingValues} empty cells</Badge></div><div className="max-h-[430px] overflow-auto rounded-lg border"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-[#f6f8f7]"><tr>{parsed.columns.map((column) => <th key={column.slug} className="border-b px-3 py-2 font-semibold">{column.originalLabel}</th>)}</tr></thead><tbody className="divide-y">{parsed.previewRows.map((row, index) => <tr key={index}>{parsed.columns.map((column) => <td key={column.slug} className="max-w-56 truncate px-3 py-2 text-[#596561]">{String(row[column.originalLabel] ?? "") || <span className="text-[#b0b7b4]">Empty</span>}</td>)}</tr>)}</tbody></table></div></CardContent></Card>}
    {step === 2 && parsed && <div className="space-y-6"><Card className="border-[#cfe2da] bg-[#f5faf8]"><CardHeader><CardTitle>Choose the two required spreadsheet columns</CardTitle><p className="mt-1 text-sm leading-6 text-[#5f6f69]">The email column decides where the message goes. The template selection key decides which template each row receives. Placeholder values are connected after routing.</p></CardHeader></Card><Card><CardHeader><CardTitle>Required setup</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div><Label>Recipient email / To column <span className="text-[#b42318]">*</span></Label><Select value={mapping.recipient_email ?? ""} onChange={(event) => setMapping((current) => ({ ...current, recipient_email: event.target.value }))}><option value="">Choose email column</option>{parsed.columns.map((column) => <option value={column.originalLabel} key={column.slug}>{column.originalLabel}</option>)}</Select><p className="mt-2 text-xs text-[#68736f]">Every value in this column is validated as the recipient address.</p></div><div><Label>Template selection column/key <span className="text-[#b42318]">*</span></Label><Select value={routingColumn} onChange={(event) => { setRoutingColumn(event.target.value); setRouteMap({}); setPlaceholderMap({}); }}><option value="">Choose template key</option>{parsed.columns.map((column) => <option key={column.slug} value={column.originalLabel}>{column.originalLabel}</option>)}</Select><p className="mt-2 text-xs text-[#68736f]">Values are matched exactly against template Category first, then template Name.</p></div><div className="md:col-span-2"><Label>Spreadsheet subject column (optional)</Label><Select value={mapping.subject ?? ""} onChange={(event) => setMapping((current) => ({ ...current, subject: event.target.value }))}><option value="">Use template subjects</option>{parsed.columns.map((column) => <option value={column.originalLabel} key={column.slug}>{column.originalLabel}</option>)}</Select></div></CardContent></Card></div>}
    {step === 3 && <Card><CardHeader><CardTitle>Match spreadsheet values to templates</CardTitle><p className="mt-1 text-sm text-[#68736f]">Selection key: <strong>{routingColumn}</strong>. Exact, case-insensitive matches use template Category first and template Name second. Every suggestion remains visible for confirmation.</p></CardHeader><CardContent>{routeValues.length ? <div className="divide-y rounded-lg border">{routeValues.map((value) => <div key={value} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_180px_1fr] md:items-center"><div><div className="text-sm font-semibold">{value}</div><div className="mt-1 text-xs text-[#7a8581]">Spreadsheet value</div></div><Select value={routeMap[value]?.action ?? "skip"} onChange={(event) => setRouteMap((current) => ({ ...current, [value]: { action: event.target.value as "template" | "fallback" | "skip", templateId: current[value]?.templateId ?? "" } }))}><option value="template">Use template</option><option value="fallback">Use fallback</option><option value="skip">Skip this value</option></Select><Select disabled={routeMap[value]?.action !== "template"} value={routeMap[value]?.templateId ?? ""} onChange={(event) => setRouteMap((current) => ({ ...current, [value]: { action: "template", templateId: event.target.value } }))}><option value="">Choose matching template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} - Category: {template.category || "None"}</option>)}</Select></div>)}</div> : <div className="rounded-lg border bg-[#f8faf9] p-6 text-sm text-[#68736f]">No non-empty values were found in the selected template key column.</div>}<div className="mt-5 max-w-lg"><Label>Fallback template (optional)</Label><Select value={fallbackTemplate} onChange={(event) => setFallbackTemplate(event.target.value)}><option value="">No fallback - safest default</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div></CardContent></Card>}
    {step === 4 && parsed && <Card><CardHeader><CardTitle>Connect template placeholders</CardTitle><p className="mt-1 text-sm text-[#68736f]">These placeholders were detected in the selected templates. Choose the spreadsheet column that supplies each value. Sender and signature placeholders come from Settings and do not appear here.</p><div className="mt-3 flex flex-wrap gap-2">{selectedTemplates.map((template) => <Badge key={template.id} tone="info">{template.name}</Badge>)}</div></CardHeader><CardContent>{requiredPlaceholders.length ? <div className="divide-y rounded-lg border">{requiredPlaceholders.map((placeholder) => <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1.2fr] md:items-center" key={placeholder}><div className="flex items-center gap-2"><Braces size={15} className="text-[#176b55]" /><code className="font-semibold text-[#176b55]">{`{{${placeholder}}}`}</code>{!placeholderMap[placeholder] && <Badge tone="danger">Not mapped</Badge>}</div><Select value={placeholderMap[placeholder] ?? ""} onChange={(event) => setPlaceholderMap((current) => ({ ...current, [placeholder]: event.target.value }))}><option value="">Choose spreadsheet column</option>{parsed.columns.map((column) => <option value={column.originalLabel} key={column.slug}>{column.originalLabel}</option>)}</Select></div>)}</div> : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-[#68736f]">The selected templates do not contain spreadsheet-backed placeholders.</div>}{requiredPlaceholders.some((placeholder) => !placeholderMap[placeholder]) && <div className="mt-4 flex gap-2 rounded-lg bg-[#fff5e5] p-3 text-xs text-[#895006]"><AlertCircle size={15} className="shrink-0" />Unmapped placeholders will be shown in Review and must be connected before affected emails can be sent.</div>}</CardContent></Card>}
    {step === 5 && parsed && <div className="grid gap-6 xl:grid-cols-[1fr_.7fr]"><Card><CardHeader><CardTitle>Review import</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label>Dataset name</Label><Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} /></div><div><Label>Subject strategy</Label><Select value={subjectStrategy} onChange={(event) => setSubjectStrategy(event.target.value as SubjectStrategy)}><option value="spreadsheet_fallback">Spreadsheet subject with template fallback</option><option value="template">Template subject</option><option value="spreadsheet">Spreadsheet subject only</option></Select></div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={keepOriginal} onChange={(event) => setKeepOriginal(event.target.checked)} /><span><strong>Keep original imported file</strong><span className="mt-1 block text-xs text-[#68736f]">Upload it only now to the private imports bucket.</span></span></label><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={saveProfile} onChange={(event) => setSaveProfile(event.target.checked)} /><span className="w-full"><strong>Save this setup for reuse</strong>{saveProfile && <Input className="mt-2" placeholder="Setup profile name" value={profileName} onChange={(event) => setProfileName(event.target.value)} />}</span></label></CardContent></Card><Card><CardHeader><CardTitle>Import and routing summary</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{[["File", parsed.fileName], ["Worksheet", parsed.selectedSheet], ["Rows", parsed.rows.length.toLocaleString()], ["Recipient email / To", mapping.recipient_email || "Not selected"], ["Template selection key", routingColumn || "Not selected"], ["Unique key values", routeValues.length], ["Templates selected", selectedTemplates.map((template) => template.name).join(", ") || "None"], ["Placeholder mapping", `${requiredPlaceholders.filter((placeholder) => placeholderMap[placeholder]).length} of ${requiredPlaceholders.length} connected`]].map(([label, value]) => <div className="flex justify-between gap-4" key={String(label)}><span className="text-[#68736f]">{label}</span><strong className="max-w-[60%] text-right">{value}</strong></div>)}{requiredPlaceholders.some((placeholder) => !placeholderMap[placeholder]) && <div className="mt-3 flex gap-2 rounded-lg bg-[#fff5e5] p-3 text-xs text-[#895006]"><AlertCircle size={15} className="shrink-0" />Missing placeholder mapping: {requiredPlaceholders.filter((placeholder) => !placeholderMap[placeholder]).map((placeholder) => `{{${placeholder}}}`).join(", ")}. You can finish this inside the dataset before sending.</div>}</CardContent></Card></div>}
    {step === 6 && <Card><CardContent className="flex min-h-[380px] flex-col items-center justify-center text-center"><LoaderCircle className="animate-spin text-[#176b55]" size={28} /><h2 className="mt-4 text-lg font-semibold">Importing your dataset</h2><p className="mt-2 text-sm text-[#68736f]">Saving columns, rows, routing rules, and the optional private source file.</p></CardContent></Card>}
    {step > 0 && step < 6 && <div className="mt-6 flex justify-between"><Button variant="outline" onClick={() => setStep((value) => value - 1)} disabled={pending}><ArrowLeft size={15} />Back</Button>{step < 5 ? <Button onClick={goNext}>Continue<ArrowRight size={15} /></Button> : <Button onClick={importDataset} disabled={pending || !datasetName.trim()}>{pending && <LoaderCircle className="animate-spin" size={15} />}Import {parsed?.rows.length.toLocaleString()} rows</Button>}</div>}
  </div>;
}
