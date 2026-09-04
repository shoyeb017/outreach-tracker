"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Eye, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { RichEmailEditor } from "@/components/editor/rich-email-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractPlaceholders, sanitizeEmailHtml } from "@/lib/templates/placeholders";
import type { EmailTemplate } from "@/types";

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
  { group: "Profile data", label: "Sender name", token: "{{profile.name}}" },
  { group: "Profile data", label: "Designation", token: "{{profile.designation}}" },
  { group: "Profile data", label: "Organization", token: "{{profile.company}}" },
  { group: "Profile data", label: "Email", token: "{{profile.email}}" },
  { group: "Profile data", label: "Phone", token: "{{profile.phone}}" },
  { group: "Profile data", label: "Website", token: "{{profile.website}}" },
  { group: "System", label: "Complete signature", token: "{{signature}}" },
];

export function TemplateForm({ template, duplicate = false }: { template?: EmailTemplate; duplicate?: boolean }) {
  const router = useRouter();
  const systemLocked = Boolean(template?.is_system && !duplicate);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [help, setHelp] = useState(false);
  const [name, setName] = useState(duplicate ? `${template?.name} copy` : template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [subject, setSubject] = useState(template?.subject_template ?? "");
  const [html, setHtml] = useState(template?.html_body ?? "<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>");
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

  function insertSubject(token: string) {
    setSubject((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}${token}`);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (systemLocked) return;
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to save this template.");
      const payload = {
        name: name.trim(), description: description.trim() || null, category: category.trim() || null,
        subject_template: subject, html_body: sanitizeEmailHtml(html), plain_text_body: plain.trim() || null,
        signature_behavior: signatureBehavior, is_active: active, is_archived: false,
      };
      if (template && !duplicate) {
        const { error } = await supabase.from("templates").update(payload).eq("id", template.id);
        if (error) throw error;
        toast.success("Template saved"); router.refresh();
      } else {
        const { data, error } = await supabase.from("templates").insert({ ...payload, user_id: user.id, is_system: false }).select("id").single();
        if (error) throw error;
        toast.success("Template created"); router.push(`/templates/${data.id}`); router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save template.");
    } finally { setPending(false); }
  }

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {systemLocked && <Card className="border-[#b9cee9] bg-[#f5f8fd]"><CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="font-semibold text-[#244b86]">This system template is read-only</div><p className="mt-1 text-sm text-[#536b8f]">Create a personal copy to change its wording, subject, placeholders, or publishing status.</p></div><Link href={`/templates/${template?.id}?duplicate=1`}><Button className="w-full sm:w-auto"><Copy size={15} />Duplicate to edit</Button></Link></CardContent></Card>}
        {!systemLocked && <Card className="border-[#cfe2da] bg-[#f5faf8]"><CardContent><div className="font-semibold text-[#176b55]">Use any placeholder you need</div><p className="mt-1 text-sm leading-6 text-[#5f6f69]">Type any safe name inside double braces, such as <code>{"{{decision_maker}}"}</code> or <code>{"{{annual_revenue}}"}</code>. It is detected automatically and will be mapped to a spreadsheet column inside each dataset.</p></CardContent></Card>}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Template details</CardTitle>{template?.is_system && <p className="mt-1 text-xs text-[#68736f]">System templates are read-only. Duplicate this template to customize it.</p>}</div>
            {template?.is_system && <Badge>System</Badge>}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required disabled={systemLocked} /></div>
            <div><Label>Routing category (exact-match label)</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} disabled={systemLocked} /><p className="mt-1 text-xs text-[#68736f]">Dataset selection-key values match this Category first, then the template Name.</p></div>
            <div className="md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={systemLocked} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Subject</CardTitle></CardHeader>
          <CardContent>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={systemLocked} />
            <select aria-label="Insert subject placeholder" className="mt-2 h-9 rounded-lg border bg-white px-3 text-xs font-semibold" value="" disabled={systemLocked} onChange={(event) => { if (event.target.value) insertSubject(event.target.value); event.target.value = ""; }}>
              <option value="">Insert placeholder</option>
              {placeholders.map((item) => <option key={item.token} value={item.token}>{item.label} · {item.token}</option>)}
            </select>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Email body</CardTitle></CardHeader><CardContent>{systemLocked ? <div className="min-h-64 rounded-lg border bg-[#fafbfb] p-5 text-sm leading-7" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }} /> : <RichEmailEditor value={html} onChange={setHtml} placeholders={placeholders} />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Plain-text fallback</CardTitle></CardHeader><CardContent><Textarea className="min-h-40 font-mono text-xs" value={plain} onChange={(e) => setPlain(e.target.value)} disabled={systemLocked} placeholder="Optional plain-text version" /></CardContent></Card>
      </div>
      <aside className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Publishing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Signature behavior</Label><Select value={signatureBehavior} onChange={(e) => setSignatureBehavior(e.target.value as typeof signatureBehavior)} disabled={systemLocked}><option value="token_only">Use only where {`{{signature}}`} appears</option><option value="append">Append current signature</option><option value="none">No signature</option></Select></div>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={systemLocked} />Active and available for routing</label>
            <Button type="button" variant="outline" className="w-full" onClick={() => setPreview((value) => !value)}><Eye size={15} />{preview ? "Hide preview" : "Preview"}</Button>
            {!systemLocked && <Button type="submit" className="w-full" disabled={pending || !name.trim() || !subject.trim()}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}{template && !duplicate ? "Save changes" : "Create template"}</Button>}
            <Link href="/templates"><Button type="button" variant="ghost" className="w-full"><ArrowLeft size={15} />Back to templates</Button></Link>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Automatically detected placeholders</CardTitle></CardHeader><CardContent>{used.length ? <div className="flex flex-wrap gap-2">{used.map((token) => <Badge key={token} tone="info">{`{{${token}}}`}</Badge>)}</div> : <p className="text-sm text-[#7a8581]">Type a placeholder in the subject, email body, or plain-text fallback and it will appear here automatically.</p>}<p className="mt-4 text-xs leading-5 text-[#68736f]">There is no fixed recipient-field list. Sender placeholders and the complete signature come from Settings; every other placeholder is connected to a spreadsheet column in the dataset.</p><Button type="button" className="mt-4 w-full" variant="outline" onClick={() => setHelp(true)}>Placeholder help</Button></CardContent></Card>
        {help && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10211b]/45 p-4" role="dialog" aria-modal="true"><Card className="w-full max-w-lg shadow-2xl"><CardHeader><CardTitle>Template placeholders</CardTitle></CardHeader><CardContent><div className="max-h-96 divide-y overflow-auto">{placeholders.map((item) => <div className="py-3" key={`${item.group}-${item.token}`}><code className="text-sm font-semibold text-[#176b55]">{item.token}</code><div className="mt-1 text-xs text-[#68736f]">{item.label} - {item.group}</div></div>)}</div><p className="mt-4 text-xs leading-5 text-[#68736f]">Suggestions are optional. Any placeholder typed with double braces is detected automatically. Dataset placeholders must be connected to spreadsheet columns before sending; missing values block only the affected rows.</p><Button type="button" className="mt-5 w-full" onClick={() => setHelp(false)}>Close</Button></CardContent></Card></div>}
        {preview && <Card><CardHeader><CardTitle>Email preview</CardTitle></CardHeader><CardContent><div className="border-b pb-3"><div className="text-[10px] font-bold uppercase text-[#8a9490]">Subject</div><div className="mt-1 text-sm font-semibold">{subject}</div></div><div className="pt-4 text-sm leading-6" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }} /></CardContent></Card>}
      </aside>
    </form>
  );
}
