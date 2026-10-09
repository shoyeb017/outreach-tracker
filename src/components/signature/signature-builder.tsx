"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { renderSignature } from "@/lib/email/signature";
import type { SignatureField } from "@/types";

export function SignatureBuilder({ initialFields, microsoftEmail }: { initialFields: SignatureField[]; microsoftEmail?: string | null }) {
  const [fields, setFields] = useState(() => [...initialFields].sort((a, b) => a.display_order - b.display_order));
  const [selectedId, setSelectedId] = useState(initialFields.slice().sort((a, b) => a.display_order - b.display_order)[0]?.id ?? "");
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Your saved signature is ready.");
  const selected = fields.find((field) => field.id === selectedId);
  useEffect(() => { if (!dirtyIds.length) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirtyIds.length]);
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
    else { setFields((current) => [...current, data]); setSelectedId(data.id); setSaveStatus("Block added. Enter its content below, then save."); }
  }

  function changeLocal(id: string, patch: Partial<SignatureField>, markDirty = true) {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
    if (markDirty) { setDirtyIds((current) => current.includes(id) ? current : [...current, id]); setSaveStatus("Unsaved changes"); }
  }

  async function saveChanges() {
    if (busy || !dirtyIds.length) return;
    if (fields.some((field) => dirtyIds.includes(field.id) && field.field_type === "image" && field.value.trim() && !/^https:\/\//i.test(field.value.trim()))) { setSaveStatus("Use an HTTPS image URL before saving your logo."); toast.error("Logo URLs must start with https://"); return; }
    setBusy(true); setSaveStatus("Saving…");
    const failed: string[] = [];
    try {
      for (const field of fields.filter((item) => dirtyIds.includes(item.id))) {
        const { label, value, field_type, enabled, show_label, clickable, url, style_preference } = field;
        const { error } = await getSupabaseBrowserClient().from("signature_fields").update({ label, value, field_type, enabled, show_label, clickable, url, style_preference }).eq("id", field.id);
        if (error) failed.push(field.id);
      }
      setDirtyIds(failed);
      setSaveStatus(failed.length ? "Some blocks were not saved. Your edits are still here; try saving again." : "Signature saved");
      if (failed.length) toast.error("Some signature changes were not saved. Try again."); else toast.success("Signature saved");
    } catch { setSaveStatus("Could not save. Your edits are still here; try again."); toast.error("Could not save your signature."); }
    finally { setBusy(false); }
  }

  async function runAction(action: () => Promise<unknown>) {
    if (busy || uploadingId) return;
    setBusy(true);
    try { await action(); }
    catch { setSaveStatus("This change could not be saved. Please try again."); toast.error("Could not update your signature. Please try again."); }
    finally { setBusy(false); }
  }

  async function removeField(id: string) {
    if (!window.confirm("Delete this signature line?")) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("signature_fields").delete().eq("id", id);
    if (error) toast.error("Could not remove this line. Please try again.");
    else { setFields((current) => current.filter((item) => item.id !== id)); setDirtyIds((current) => current.filter((item) => item !== id)); if (selectedId === id) setSelectedId(fields.find((item) => item.id !== id)?.id ?? ""); setSaveStatus("Line removed. Uploaded assets are retained for saved email snapshots."); }
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
      const stylePreference = { ...field.style_preference, width: Number(field.style_preference?.width) || 120, storagePath: path };
      const { error: updateError } = await supabase.from("signature_fields").update({ value: publicUrl, style_preference: stylePreference }).eq("id", field.id);
      if (updateError) {
        await supabase.storage.from("signature-assets").remove([path]);
        throw updateError;
      }

      changeLocal(field.id, { value: publicUrl, style_preference: stylePreference }, false);
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
    if (failed) { setFields(fields); setSaveStatus("Order not fully saved. Refresh and try again."); toast.error("Could not save the complete order. Please refresh and try again."); } else setSaveStatus("Order saved");
  }

  return (
    <div id="signature" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-xl font-semibold">Create your signature</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">Add a block, edit its content, and arrange it in any order.</p></div>
        <Button onClick={saveChanges} disabled={busy || !!uploadingId || !dirtyIds.length}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}Save signature</Button>
      </div>
      <p role="status" className="text-sm text-[var(--muted-foreground)]">{saveStatus}{dirtyIds.length > 0 && !busy ? " · Preview includes your unsaved edits." : ""}</p>
      <fieldset disabled={busy || !!uploadingId} className="min-w-0">
        <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <Card><CardHeader><CardTitle>Signature blocks</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => runAction(() => addField("text"))}><Plus size={15} />Add text</Button><Button variant="outline" onClick={() => runAction(() => addField("image"))}><ImagePlus size={15} />Add logo</Button></div>
              {fields.length ? <ol aria-label="Signature block list" tabIndex={0} className="focus-ring max-h-40 space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-[min(440px,50dvh)]">{fields.map((field, index) => <li key={field.id} className={`flex flex-wrap items-center gap-1 rounded-xl border p-2 ${selectedId === field.id ? "border-[var(--border)] bg-[var(--muted)]" : "bg-[var(--card)]"}`}>
                <button type="button" aria-pressed={selectedId === field.id} aria-label={`Edit block ${index + 1}`} onClick={() => setSelectedId(field.id)} className="focus-ring flex w-full min-w-0 items-center gap-2 rounded-lg p-1 text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold">{index + 1}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{field.field_type === "image" ? field.label || "Logo" : field.value || "Empty text block"}</span><span className="mt-1 block text-xs text-[var(--muted-foreground)]">{field.field_type === "image" ? "Image" : "Text"}{!field.enabled ? " · Hidden" : ""}{dirtyIds.includes(field.id) ? " · Not saved" : ""}</span></span>
                </button>
                <Button variant="ghost" size="icon" aria-label={`Move block ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => runAction(() => move(index, -1))}><ArrowUp size={15} /></Button>
                <Button variant="ghost" size="icon" aria-label={`Move block ${index + 1} down`} title="Move down" disabled={index === fields.length - 1} onClick={() => runAction(() => move(index, 1))}><ArrowDown size={15} /></Button>
              </li>)}</ol> : <div className="rounded-xl border border-dashed px-6 py-10 text-left"><p className="font-semibold">Start with a text line or logo</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Your name, a greeting, contact details—only add what you want to show. A signature is optional.</p></div>}
              <p className="text-xs text-[var(--muted-foreground)]">Select a block to edit it. Use the arrows to change its position.</p>
            </CardContent></Card>
          </div>
            {selected ? <Card key={selected.id} className="min-w-0"><CardHeader><CardTitle>Edit {selected.field_type === "image" ? "logo" : "text block"}</CardTitle></CardHeader><CardContent className="space-y-6">
              {selected.field_type === "image" ? <>
                <div><Label htmlFor="signature-upload">Upload a logo</Label><Input id="signature-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void uploadLogo(selected, event.target.files?.[0]); event.target.value = ""; }} /><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">PNG, JPG, WebP or GIF, up to 2 MB. Uploaded images are public so email clients can display them.</p></div>
                <div><Label htmlFor="signature-width">Logo width (pixels)</Label><Input id="signature-width" type="number" min={24} max={600} value={String(selected.style_preference?.width ?? 120)} onChange={(event) => changeLocal(selected.id, { style_preference: { ...selected.style_preference, width: event.target.value } })} onBlur={(event) => changeLocal(selected.id, { style_preference: { ...selected.style_preference, width: Math.min(600, Math.max(24, Number(event.target.value) || 120)) } })} /><p className="mt-2 text-xs text-[var(--muted-foreground)]">24–600 pixels. Height adjusts automatically.</p></div>
                <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Image details and link</summary><div className="mt-5 space-y-5">
                  <div><Label htmlFor="signature-image-url">Image URL · alternative to upload</Label><Input id="signature-image-url" type="url" placeholder="https://example.com/logo.png" value={selected.value} onChange={(event) => changeLocal(selected.id, { value: event.target.value })} /></div>
                  <div><Label htmlFor="signature-alt">Image description</Label><Input id="signature-alt" value={selected.label} onChange={(event) => changeLocal(selected.id, { label: event.target.value })} /></div>
                  <div><Label htmlFor="signature-link">Website opened when clicked · optional</Label><Input id="signature-link" type="url" value={selected.url ?? ""} placeholder="https://your-company.com" onChange={(event) => changeLocal(selected.id, { url: event.target.value || null, clickable: !!event.target.value })} /></div>
                </div></details>
              </> : <>
                <div><Label htmlFor="signature-value">Text to display</Label><Input id="signature-value" placeholder="e.g. Best regards, or your name" value={selected.value} onChange={(event) => changeLocal(selected.id, { value: event.target.value })} /></div>
                <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Formatting and links</summary><div className="mt-5 space-y-6">
                  <div className="space-y-3 rounded-lg bg-[var(--surface-hover)] p-4"><h3 className="text-xs font-semibold normal-case text-[var(--muted-foreground)]">Link behavior</h3><div><Label htmlFor="signature-type">Content type</Label><Select id="signature-type" value={selected.field_type} onChange={(event) => changeLocal(selected.id, { field_type: event.target.value as SignatureField["field_type"], clickable: event.target.value !== "text" && selected.clickable })}><option value="text">Plain text</option><option value="email">Email address</option><option value="phone">Phone number</option><option value="url">Website</option></Select></div>

                  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.clickable} disabled={selected.field_type === "text"} onChange={(event) => changeLocal(selected.id, { clickable: event.target.checked })} />Make this a clickable link</label>
                  <div><Label htmlFor="signature-custom-link">Custom link · optional</Label><Input id="signature-custom-link" value={selected.url ?? ""} onChange={(event) => changeLocal(selected.id, { url: event.target.value || null })} placeholder="Leave empty to link to the displayed value" /></div><p className="text-xs leading-5 text-[var(--muted-foreground)]">Choose Email, Phone, or Website to enable a link. Leave the custom link blank to use the displayed value.</p></div>
                  <div className="space-y-3 rounded-lg bg-[var(--surface-hover)] p-4"><h3 className="text-xs font-semibold normal-case text-[var(--muted-foreground)]">Appearance</h3><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.style_preference?.bold === true} onChange={(event) => changeLocal(selected.id, { style_preference: { ...selected.style_preference, bold: event.target.checked } })} />Bold text</label><div><Label htmlFor="signature-label">Label · optional</Label><Input id="signature-label" placeholder="e.g. Phone" value={selected.label} onChange={(event) => changeLocal(selected.id, { label: event.target.value })} /></div>
                  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.show_label} onChange={(event) => changeLocal(selected.id, { show_label: event.target.checked })} />Display the label before the text</label>
                  </div>
                </div></details>
              </>}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.enabled} onChange={(event) => changeLocal(selected.id, { enabled: event.target.checked })} />Show this block in my signature</label>
                <Button variant="ghost" className="text-[var(--danger)]" onClick={() => runAction(() => removeField(selected.id))}><Trash2 size={15} />Delete block</Button>
              </div>
            </CardContent></Card> : <Card><CardContent className="py-12 text-left text-sm text-[var(--muted-foreground)]">Add or select a block to edit its details here.</CardContent></Card>}
          <Card className="min-w-0 lg:col-span-2 2xl:col-span-1"><CardHeader><CardTitle>Signature preview</CardTitle><p className="mt-2 text-xs text-[var(--muted-foreground)]">Updates as you edit. Save to use your changes in emails.</p></CardHeader><CardContent className="p-6 sm:p-8"><p className="mb-6 break-all text-xs text-[var(--muted-foreground)]">From: {microsoftEmail || "Your connected Microsoft mailbox"}</p><div className="email-content min-h-40 break-words">{preview ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="text-sm text-[#52647b]">No signature will be added.</p>}</div></CardContent></Card>
        </div>
      </fieldset>
      <p className="text-xs leading-6 text-[var(--muted-foreground)]">Save text and formatting with Save signature. New blocks, uploads, ordering, and deletions apply immediately. Templates include it using {"{{signature}}"} or their signature placement setting.</p>
    </div>
  );
}
