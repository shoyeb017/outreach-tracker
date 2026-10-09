"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Eye, LoaderCircle, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { RichEmailEditor } from "@/components/editor/rich-email-editor";
import { Dialog } from "@/components/ui/dialog";
import { renderSignature } from "@/lib/email/signature";
import { normalizeSignatureTokenBlocks } from "@/lib/email/render";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractPlaceholders, resolvePlaceholders, sanitizeEmailHtml } from "@/lib/templates/placeholders";
import type { EmailTemplate, SignatureField } from "@/types";

const standardPlaceholders = [
  { group: "Spreadsheet suggestions", label: "Recipient email", token: "{{recipient_email}}" },
  { group: "Spreadsheet suggestions", label: "Recipient name", token: "{{recipient_name}}" },
  { group: "Spreadsheet suggestions", label: "First name", token: "{{first_name}}" },
  { group: "Spreadsheet suggestions", label: "Last name", token: "{{last_name}}" },
  { group: "Spreadsheet suggestions", label: "Company name", token: "{{company_name}}" },
  { group: "Spreadsheet suggestions", label: "Company email", token: "{{company_email}}" },
  { group: "Spreadsheet suggestions", label: "Industry / category", token: "{{industry}}" },
  { group: "Spreadsheet suggestions", label: "Business type", token: "{{business_type}}" },
  { group: "Spreadsheet suggestions", label: "Phone", token: "{{phone}}" },
  { group: "Spreadsheet suggestions", label: "Website", token: "{{website}}" },
  { group: "Spreadsheet suggestions", label: "Location", token: "{{location}}" },
  { group: "Spreadsheet suggestions", label: "Spreadsheet subject", token: "{{subject}}" },
  { group: "System", label: "Complete signature", token: "{{signature}}" },
];

export function TemplateForm({ template, duplicate = false, signatureFields = [], sampleData = {} }: { template?: EmailTemplate; duplicate?: boolean; signatureFields?: SignatureField[]; sampleData?: Record<string, unknown> }) {
  const router = useRouter();
  const systemLocked = Boolean(template?.is_system && !duplicate);
  const [fieldName, setFieldName] = useState("");
  const [fieldTarget, setFieldTarget] = useState("body");
  const [formError, setFormError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(true);
  const [help, setHelp] = useState(false);
  const [name, setName] = useState(duplicate ? `${template?.name} copy` : template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [subject, setSubject] = useState(template?.subject_template ?? "");
  const [html, setHtml] = useState(template?.html_body ?? "<p>Hi {{first_name}},</p><p></p>{{signature}}");
  const [plain, setPlain] = useState(template?.plain_text_body ?? "");
  const [signatureBehavior, setSignatureBehavior] = useState(template?.signature_behavior ?? "token_only");
  const [active, setActive] = useState(template?.is_active ?? true);
  const used = useMemo(() => Array.from(new Set([...extractPlaceholders(subject), ...extractPlaceholders(html), ...extractPlaceholders(plain)])), [html, plain, subject]);
  const placeholders = useMemo(() => {
    const uniqueByToken = new Map(standardPlaceholders.map((item) => [item.token, item]));
    for (const placeholder of used) {
      const token = `{{${placeholder}}}`;
      if (!uniqueByToken.has(token)) uniqueByToken.set(token, { group: "Detected in this template", label: placeholder.replaceAll("_", " "), token });
    }
    return Array.from(uniqueByToken.values());
  }, [used]);

  const currentDraft = JSON.stringify({ name, description, category, subject, html, plain, signatureBehavior, active });
  const [savedDraft, setSavedDraft] = useState(currentDraft);
  const dirty = !systemLocked && (duplicate || !template || currentDraft !== savedDraft);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const demo: Record<string, unknown> = { company_name: "Northstar Labs", company: "Northstar Labs", recipient_name: "Avery Morgan", first_name: "Avery", industry: "Technology & Software", recipient_email: "contact@example.com", ...sampleData, ...previewValues };
  for (const token of used) if (demo[token] == null && token !== "signature") demo[token] = "Example value";
  const signature = signatureBehavior === "none" ? "" : renderSignature(signatureFields);
  const previewContext: Record<string, unknown> = { ...demo, signature };
  // Dot paths remain editable in the sample preview as well as normal fields.
  for (const token of used.filter((token) => token.includes("."))) {
    const parts = token.split("."); if (parts.some((part) => ["__proto__", "constructor", "prototype"].includes(part))) continue;
    let node = previewContext;
    for (const part of parts.slice(0, -1)) { node[part] = { ...((node[part] as Record<string, unknown>) ?? {}) }; node = node[part] as Record<string, unknown>; }
    node[parts.at(-1)!] = demo[token] ?? "Example value";
  }
  const sampleSubject = resolvePlaceholders(subject, previewContext).output;
  let sampleBody = resolvePlaceholders(normalizeSignatureTokenBlocks(html), previewContext, true).output;
  if (signatureBehavior === "append" && !extractPlaceholders(html).includes("signature")) sampleBody += signature;

  function insertSubject(token: string) {
    setSubject((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}${token}`);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (systemLocked || pending) return;
    if (!name.trim() || !subject.trim() || !sanitizeEmailHtml(html).replace(/<[^>]*>/g, "").trim()) { setFormError("Add a template name, an email subject, and a message before saving."); return; }
    setFormError("");
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to save this template.");
      const payload = {
        name: name.trim(), description: description.trim() || null, category: category.trim() || null,
        subject_template: subject, html_body: sanitizeEmailHtml(html), plain_text_body: plain.trim() || null,
        signature_behavior: signatureBehavior, is_active: active, is_archived: template && !duplicate ? template.is_archived : false,
      };
      if (template && !duplicate) {
        const { error } = await supabase.from("templates").update(payload).eq("id", template.id);
        if (error) throw error;
        setSavedDraft(currentDraft); toast.success("Template saved"); router.refresh();
      } else {
        const { data, error } = await supabase.from("templates").insert({ ...payload, user_id: user.id, is_system: false }).select("id").single();
        if (error) throw error;
        toast.success("Template created"); router.push(`/templates/${data.id}`); router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save template. Please try again.";
      setFormError(message); toast.error(message);
    } finally { setPending(false); }
  }

  function addField() {
    const field = fieldName.trim().replace(/^{{\s*|\s*}}$/g, "");
    if (!/^[a-zA-Z0-9_]+(?:[.-][a-zA-Z0-9_]+)*$/.test(field) || field.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
      setFieldError("Use a field name such as company_name or contact.name, without spaces."); return;
    }
    const token = "{{" + field + "}}";
    if (fieldTarget === "subject") insertSubject(token); else setHtml((value) => value + "<p>" + token + "</p>");
    setFieldName(""); setFieldError("");
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {systemLocked && <div className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">Ready-made template · read-only</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">Make your own copy to change the wording or settings.</p></div><ButtonLink href={`/templates/${template?.id}?duplicate=1`}><Copy size={15} />Make a copy</ButtonLink></div>}
      {template?.is_archived && !duplicate && <p className="rounded-xl border bg-[var(--muted)] p-4 text-sm">This template is archived and cannot be selected for sending. Saving edits keeps it archived. Restore it from More options to use it again.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--card)] p-3">
        <div><ButtonLink href="/templates" variant="ghost" size="sm" onClick={(event) => { if (dirty && !window.confirm("Leave without saving your template changes?")) event.preventDefault(); }}><ArrowLeft size={14} />Back to templates</ButtonLink><p className="mt-1 px-3 text-xs text-[var(--muted-foreground)]" role="status">{systemLocked ? "Read-only template" : pending ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</p></div>
        <div className="flex min-w-0 flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { setPreview(true); document.getElementById("template-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}><Eye size={15} />Preview</Button>{!systemLocked && <Button type="submit" disabled={pending}>{pending ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{template && !duplicate ? "Save changes" : "Create template"}</Button>}</div>
      </div>
      {formError && <p role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--danger)]">{formError}</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
        <div className="space-y-5">
          <Card><CardContent className="space-y-4">
            <div><Label htmlFor="template-name">Name</Label><Input id="template-name" placeholder="e.g. Introduction for technology companies" value={name} onChange={(e) => setName(e.target.value)} required disabled={systemLocked} /><p className="mt-1 text-xs text-[var(--muted-foreground)]">An internal name to help you find this template. Recipients will not see it.</p></div>
            <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Category and description <span className="font-normal text-[var(--muted-foreground)]">· optional</span></summary><div className="mt-4 space-y-4">
              <div><Label htmlFor="template-category">Category</Label><Input id="template-category" placeholder="e.g. Technology & Software" value={category} onChange={(e) => setCategory(e.target.value)} disabled={systemLocked} /><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">When choosing different templates by a spreadsheet column, its values match this category first, then the template name. Leave blank if everyone gets the same template.</p></div>
              <div><Label htmlFor="template-description">Description</Label><Textarea id="template-description" placeholder="When should your team use this message?" value={description} onChange={(e) => setDescription(e.target.value)} disabled={systemLocked} /></div>
            </div></details>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Write your email</CardTitle><p className="text-sm text-[var(--muted-foreground)]">Write a message once. Personal fields change for each recipient.</p></CardHeader><CardContent className="space-y-5">
            <div><Label htmlFor="template-subject">Email subject</Label><Input id="template-subject" placeholder="e.g. An idea for {{company_name}}" value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={systemLocked} />
              <Select aria-label="Insert subject placeholder" className="mt-2" value="" disabled={systemLocked} onChange={(event) => { if (event.target.value) insertSubject(event.target.value); }}><option value="">Add a field to the subject…</option>{placeholders.map((item) => <option key={item.token} value={item.token}>{item.label} · {item.token}</option>)}</Select>
            </div>
            <div><Label>Email message</Label>{systemLocked ? <div className="min-h-64 rounded-lg border bg-[var(--muted)] p-5 text-sm leading-7" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }} /> : <RichEmailEditor value={html} onChange={setHtml} placeholders={placeholders} />}</div>
            <div className="rounded-lg bg-[var(--surface-hover)] p-3"><Label htmlFor="signature-behavior">Email signature</Label><Select id="signature-behavior" value={signatureBehavior} onChange={(e) => setSignatureBehavior(e.target.value as typeof signatureBehavior)} disabled={systemLocked}><option value="token_only">Place it where {"{{signature}}"} appears</option><option value="append">Add my signature at the end</option><option value="none">No signature</option></Select><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Your signature is managed in Settings. Your sending address comes from the connected Microsoft mailbox.</p></div>
          </CardContent></Card>
          <Card><CardContent><details><summary className="cursor-pointer text-sm font-semibold">More settings</summary><div className="mt-4 space-y-4">
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={systemLocked} /><span>Available when choosing templates<span className="mt-1 block text-xs text-[var(--muted-foreground)]">Turn off to keep this template without offering it for new email setups.</span></span></label>
            <div><Label htmlFor="template-plain">Plain-text alternative · optional</Label><Textarea id="template-plain" aria-label="Optional plain-text email" className="min-h-32 font-mono text-xs" value={plain} onChange={(e) => setPlain(e.target.value)} disabled={systemLocked} /><p className="mt-1 text-xs text-[var(--muted-foreground)]">For email clients that cannot display formatted messages.</p></div>
          </div></details></CardContent></Card>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-6">
          {preview && <Card id="template-preview"><CardHeader><div className="flex items-center justify-between"><CardTitle>Sample email preview</CardTitle><Badge tone="info">Live preview</Badge></div><p className="text-xs leading-5 text-[var(--muted-foreground)]">Sample values only. No email is sent. Review actual recipients in your spreadsheet before sending.</p></CardHeader><CardContent>
            <div className="border-b pb-4"><p className="text-xs text-[var(--muted-foreground)]">Subject</p><p className="mt-1 break-words text-sm font-semibold">{sampleSubject || "Your subject will appear here"}</p></div>
            <div className="email-content break-words py-5 text-sm leading-6" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(sampleBody) }} />
            {!!used.filter((token) => token !== "signature").length && <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-semibold">Change sample values</summary><p className="mt-2 text-xs text-[var(--muted-foreground)]">These examples are not saved to your template or spreadsheet.</p><div className="mt-3 space-y-3">{used.filter((token) => token !== "signature").map((token) => <label key={token} className="block text-xs">{`{{${token}}}`}<Input value={String(previewValues[token] ?? demo[token] ?? "Example value")} onChange={(event) => setPreviewValues((current) => ({ ...current, [token]: event.target.value }))} /></label>)}</div></details>}
          </CardContent></Card>}
          <Card><CardHeader><CardTitle>Personalize your message</CardTitle></CardHeader><CardContent className="space-y-4">
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">A field such as <code>{"{{company_name}}"}</code> is replaced with a value from your spreadsheet. You choose its column during spreadsheet setup.</p>
            {!systemLocked && <div className="rounded-lg border p-3"><Label htmlFor="new-field">Add your own field</Label><Input id="new-field" placeholder="e.g. decision_maker" value={fieldName} onChange={(event) => setFieldName(event.target.value)} /><Label htmlFor="field-target" className="mt-3 block">Add it to</Label><Select id="field-target" value={fieldTarget} onChange={(event) => setFieldTarget(event.target.value)}><option value="body">End of the message</option><option value="subject">End of the subject</option></Select><Button type="button" variant="outline" className="mt-3 w-full" onClick={addField} disabled={!fieldName.trim()}><Plus size={14} />Add field</Button>{fieldError && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{fieldError}</p>}<p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">You can also type any field directly using double braces.</p></div>}
            <div><p className="mb-2 text-xs font-semibold">Fields detected in this template ({used.length})</p>{used.length ? <div className="flex flex-wrap gap-2">{used.map((token) => <Badge key={token} tone="info">{`{{${token}}}`}</Badge>)}</div> : <p className="text-xs text-[var(--muted-foreground)]">No personal fields yet. You can send the same wording to everyone.</p>}</div>
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">Only {"{{signature}}"} uses Settings. Every other field needs a spreadsheet column before sending.</p><Button type="button" variant="ghost" onClick={() => setHelp(true)}>Personalization help</Button>
          </CardContent></Card>
        </aside>
      </div>
      {help && <Dialog title="Personalization fields" onClose={() => setHelp(false)}><p className="mb-4 text-sm leading-6">Use these suggestions or create your own. Later, connect each field to the spreadsheet column that supplies its value. Missing values block the affected recipients until you fix them.</p><div className="max-h-80 divide-y overflow-auto">{placeholders.map((item) => <div className="py-3" key={item.token}><code className="text-sm font-semibold text-[var(--primary)]">{item.token}</code><p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.label} · {item.group}</p></div>)}</div><Button type="button" className="mt-4 w-full" onClick={() => setHelp(false)}>Close</Button></Dialog>}
    </form>
  );
}
