"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, ImagePlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { renderSignature } from "@/lib/email/signature";
import type { SignatureField } from "@/types";

export function SignatureBuilder({ initialFields, microsoftEmail }: { initialFields: SignatureField[]; microsoftEmail?: string | null }) {
  const [fields, setFields] = useState(() => [...initialFields].sort((a, b) => a.display_order - b.display_order));
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const preview = useMemo(() => renderSignature(fields), [fields]);

  async function addField(fieldType: "text" | "image" = "text") {
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in again to edit your signature.");
    const nextOrder = fields.reduce((highest, field) => Math.max(highest, field.display_order), -1) + 1;
    const { data, error } = await supabase.from("signature_fields").insert({
      user_id: user.id,
      label: fieldType === "image" ? "Company logo" : "",
      value: "",
      field_type: fieldType,
      display_order: nextOrder,
      enabled: true,
      show_label: false,
      clickable: false,
      style_preference: fieldType === "image" ? { width: 120 } : {},
    }).select("*").single();
    if (error) toast.error(error.message);
    else setFields((current) => [...current, data]);
  }

  function changeLocal(id: string, patch: Partial<SignatureField>) {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  }

  async function saveField(id: string, patch: Partial<SignatureField>) {
    changeLocal(id, patch);
    const { error } = await getSupabaseBrowserClient().from("signature_fields").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function removeField(id: string) {
    if (!window.confirm("Delete this signature line?")) return;
    const supabase = getSupabaseBrowserClient();
    const field = fields.find((item) => item.id === id);
    const { error } = await supabase.from("signature_fields").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      setFields((current) => current.filter((item) => item.id !== id));
      const storagePath = field?.style_preference?.storagePath;
      if (typeof storagePath === "string") {
        const { error: storageError } = await supabase.storage.from("signature-assets").remove([storagePath]);
        if (storageError) toast.warning("The signature line was deleted, but its old logo file could not be removed.");
      }
    }
  }

  async function uploadLogo(field: SignatureField, file?: File) {
    if (!file) return;
    const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
    const extension = extensions[file.type];
    if (!extension) return toast.error("Use a PNG, JPG, WebP, or GIF logo.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo files must be 2 MB or smaller.");

    setUploadingId(field.id);
    const supabase = getSupabaseBrowserClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload your logo.");
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("signature-assets").upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from("signature-assets").getPublicUrl(path).data.publicUrl;
      const previousPath = field.style_preference?.storagePath;
      const stylePreference = { ...field.style_preference, width: Number(field.style_preference?.width) || 120, storagePath: path };
      const { error: updateError } = await supabase.from("signature_fields").update({ value: publicUrl, style_preference: stylePreference }).eq("id", field.id);
      if (updateError) {
        await supabase.storage.from("signature-assets").remove([path]);
        throw updateError;
      }

      changeLocal(field.id, { value: publicUrl, style_preference: stylePreference });
      if (typeof previousPath === "string" && previousPath !== path) await supabase.storage.from("signature-assets").remove([previousPath]);
      toast.success("Logo uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the logo.");
    } finally {
      setUploadingId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const reordered = [...fields];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const next = reordered.map((field, position) => ({ ...field, display_order: position }));
    setFields(next);
    const results = await Promise.all(next.map((field) => getSupabaseBrowserClient().from("signature_fields").update({ display_order: field.display_order }).eq("id", field.id)));
    const failed = results.find((result) => result.error)?.error;
    if (failed) toast.error(failed.message);
  }

  return (
    <Card id="signature">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Dynamic signature</CardTitle>
          <p className="mt-1 text-sm text-[#68736f]">Every visible line is created here. Add “Best regards,”, your name, title, company, phone, links—or nothing at all—in any order.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => addField("image")}><ImagePlus size={14} />Add logo</Button>
          <Button size="sm" onClick={() => addField("text")}><Plus size={14} />Add line</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-7 xl:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="space-y-3">
            {fields.length ? fields.map((field, index) => (
              <div key={field.id} className={`rounded-lg border p-3 ${field.enabled ? "bg-[#fafcfb]" : "bg-[#f3f4f4] opacity-75"}`}>
                <div className="grid gap-2 md:grid-cols-[26px_minmax(110px,.7fr)_minmax(180px,1.3fr)_110px_auto]">
                  <span className="flex items-center text-[#9aa39f]"><GripVertical size={16} /></span>
                  <Input aria-label={field.field_type === "image" ? "Logo alternative text" : "Optional line label"} placeholder={field.field_type === "image" ? "Logo description" : "Optional label"} value={field.label} onChange={(event) => changeLocal(field.id, { label: event.target.value })} onBlur={(event) => saveField(field.id, { label: event.target.value })} />
                  <Input aria-label={field.field_type === "image" ? "Logo HTTPS URL" : "Signature line value"} type={field.field_type === "image" ? "url" : "text"} placeholder={field.field_type === "image" ? "https://example.com/logo.png" : "Example: Best regards,"} value={field.value} onChange={(event) => changeLocal(field.id, { value: event.target.value })} onBlur={(event) => saveField(field.id, { value: event.target.value })} />
                  <Select aria-label="Signature line type" value={field.field_type} onChange={(event) => {
                    const fieldType = event.target.value as SignatureField["field_type"];
                    saveField(field.id, {
                      field_type: fieldType,
                      show_label: fieldType === "image" ? false : field.show_label,
                      clickable: fieldType === "text" ? false : field.clickable,
                      style_preference: fieldType === "image" ? { ...field.style_preference, width: Number(field.style_preference?.width) || 120 } : field.style_preference,
                    });
                  }}>
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="url">Website</option>
                    <option value="image">Logo / image</option>
                  </Select>
                  <div className="flex">
                    <Button variant="ghost" size="icon" title={field.enabled ? "Hide line" : "Show line"} aria-label={field.enabled ? "Hide line" : "Show line"} onClick={() => saveField(field.id, { enabled: !field.enabled })}>{field.enabled ? <Eye size={14} /> : <EyeOff size={14} />}</Button>
                    <Button variant="ghost" size="icon" title="Move up" aria-label="Move line up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
                    <Button variant="ghost" size="icon" title="Move down" aria-label="Move line down" disabled={index === fields.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
                    <Button variant="ghost" size="icon" title="Delete line" aria-label="Delete signature line" onClick={() => removeField(field.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
                {field.field_type === "image" ? (
                  <div className="ml-7 mt-3 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-[auto_140px_minmax(180px,1fr)] sm:items-end">
                    <div>
                      <div className="mb-1 text-xs font-semibold text-[#596561]">Logo file</div>
                      <label className="focus-ring inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 text-xs font-semibold text-[#26322f] shadow-sm transition hover:bg-[#f7f9f8]">
                        {uploadingId === field.id ? <LoaderCircle className="animate-spin" size={14} /> : <ImagePlus size={14} />}
                        {uploadingId === field.id ? "Uploading…" : "Upload image"}
                        <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingId === field.id} onChange={(event) => { void uploadLogo(field, event.target.files?.[0]); event.target.value = ""; }} />
                      </label>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#596561]" htmlFor={`logo-width-${field.id}`}>Width (pixels)</label>
                      <Input id={`logo-width-${field.id}`} type="number" min={24} max={600} value={Number(field.style_preference?.width) || 120} onChange={(event) => changeLocal(field.id, { style_preference: { ...field.style_preference, width: Number(event.target.value) } })} onBlur={(event) => saveField(field.id, { style_preference: { ...field.style_preference, width: Math.min(600, Math.max(24, Number(event.target.value) || 120)) } })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#596561]" htmlFor={`logo-link-${field.id}`}>Click-through link (optional)</label>
                      <Input id={`logo-link-${field.id}`} type="url" placeholder="https://your-company.com" value={field.url ?? ""} onChange={(event) => changeLocal(field.id, { url: event.target.value })} onBlur={(event) => saveField(field.id, { url: event.target.value || null, clickable: Boolean(event.target.value) })} />
                    </div>
                    <p className="text-[11px] leading-5 text-[#7a8581] sm:col-span-3">Upload a PNG, JPG, WebP, or GIF up to 2 MB, or paste an HTTPS image URL above. Width is limited to 24–600 px and height scales automatically. Uploaded logos are publicly readable so email clients can display them.</p>
                  </div>
                ) : (
                  <div className="ml-7 mt-3 flex flex-wrap gap-5 text-xs text-[#596561]">
                    <label><input className="mr-1" type="checkbox" checked={field.show_label} onChange={(event) => saveField(field.id, { show_label: event.target.checked })} />Show label</label>
                    <label><input className="mr-1" type="checkbox" checked={field.style_preference?.bold === true} onChange={(event) => saveField(field.id, { style_preference: { ...field.style_preference, bold: event.target.checked } })} />Bold</label>
                    <label className={field.field_type === "text" ? "text-[#9aa39f]" : ""}><input className="mr-1" type="checkbox" checked={field.clickable} disabled={field.field_type === "text"} onChange={(event) => saveField(field.id, { clickable: event.target.checked })} />Clickable</label>
                  </div>
                )}
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm font-semibold">Your signature is empty</p>
                <p className="mt-1 text-xs leading-5 text-[#7a8581]">That is valid. Add only the lines you want recipients to see.</p>
                <div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={() => addField("image")}><ImagePlus size={14} />Add logo</Button><Button onClick={() => addField("text")}><Plus size={14} />Add text line</Button></div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#71807a]">Email preview</div>
          <div className="rounded-xl border bg-[#f7f9f8] p-3 text-xs text-[#68736f]">From: <strong className="text-[#26322f]">{microsoftEmail || "Connect Microsoft 365 below"}</strong></div>
          <div className="mt-3 min-h-72 rounded-xl border bg-white p-6 shadow-sm">{preview ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="text-sm text-[#8a9490]">No signature will be added.</p>}</div>
        </div>
      </CardContent>
    </Card>
  );
}
