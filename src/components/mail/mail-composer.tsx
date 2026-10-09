"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Paperclip, Save, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { RichEmailEditor } from "@/components/editor/rich-email-editor";
import { MailBody } from "./mail-body";
import { renderSignature } from "@/lib/email/signature";
import { addressText, parseAddresses, validateComposition } from "@/lib/mail/compose";
import { composeHtml, draftParts } from "@/lib/mail/html";
import { MAX_ATTACHMENT_BYTES, type MailAttachment, type MailMessage, type OutgoingAttachment } from "@/lib/mail/types";
import type { MailboxClient } from "@/lib/microsoft/mailbox";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UncertainSendError } from "@/lib/sending/errors";
import type { SignatureField } from "@/types";

export function MailComposer({ client, sender, fields, draft, onClose, onSaved, standalone = false }: { client: MailboxClient; sender: string; fields: SignatureField[]; draft?: MailMessage; onClose: () => void; onSaved: (kind: "sent" | "draft") => void; standalone?: boolean }) {
  const [parts] = useState(() => draft ? draftParts(draft.body?.content ?? "") : { body: "<p></p>", quote: "", signature: Boolean(fields.length), protectedOriginal: false });
  const [to, setTo] = useState(addressText(draft?.toRecipients)); const [cc, setCc] = useState(addressText(draft?.ccRecipients)); const [bcc, setBcc] = useState(addressText(draft?.bccRecipients));
  const [subject, setSubject] = useState(draft?.subject ?? ""); const [body, setBody] = useState(parts.body);
  const [signature, setSignature] = useState(parts.signature); const [quote, setQuote] = useState(parts.quote);
  const [extra, setExtra] = useState(standalone || Boolean(cc || bcc)); const [files, setFiles] = useState<OutgoingAttachment[]>([]);
  const [existing, setExisting] = useState<MailAttachment[]>([]); const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false); const [error, setError] = useState(""); const [review, setReview] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [savedDraftId, setSavedDraftId] = useState(draft?.id);
  const lock = useRef(false); const draftId = useRef(draft?.id); const fileInput = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = contentRef.current?.closest("dialog");
    if (dialog) dialog.scrollTop = 0;
  }, [review]);
  const message = { to, cc, bcc, subject, html: composeHtml(body, signature ? renderSignature(fields) : "", quote), attachments: files };
  useEffect(() => {
    if (!draft?.hasAttachments) return;
    let active = true;
    client.attachments(draft.id).then((items) => { if (active) setExisting(items); }).catch(() => { if (active) setAttachmentError("Existing attachments could not be listed. They remain on this draft; check them in Outlook before sending."); });
    return () => { active = false; };
  }, [client, draft]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const currentUrl = window.location.href; const currentHistory = window.history.state;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const back = (event: PopStateEvent) => {
      if (window.location.href !== currentUrl && (busy || !window.confirm("Leave this email? Unsaved changes will be lost. Save your draft first to keep them."))) {
        event.stopImmediatePropagation(); window.history.pushState(currentHistory, "", currentUrl);
      }
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (link && !(link as HTMLAnchorElement).target && (busy || !window.confirm("Leave this email? Unsaved changes will be lost. Save your draft first to keep them."))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); window.addEventListener("popstate", back, true); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", back, true); document.removeEventListener("click", navigate, true); };
  }, [dirty, busy]);
  function close() { if (!lock.current && (!dirty || window.confirm("Discard unsaved changes? Saved Microsoft drafts are kept."))) onClose(); }
  async function attach(list: FileList | null) {
    if (!list || busy) return;
    setError("");
    const selected = Array.from(list);
    if (draftId.current) { setError("For saved, reply, or forward drafts, add or remove attachments in Outlook. Existing attachments are preserved."); return; }
    if (selected.length + files.length > 10 || selected.reduce((total, file) => total + file.size, files.reduce((total, file) => total + file.size, 0)) > MAX_ATTACHMENT_BYTES) { setError("Attach up to 10 files, with a combined size of 2 MB or less."); return; }
    setBusy(true); lock.current = true;
    try {
      const attached = await Promise.all(selected.map((file) => new Promise<OutgoingAttachment>((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.onload = () => resolve({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", contentBytes: String(reader.result).split(",")[1] }); reader.readAsDataURL(file);
      })));
      setFiles((items) => [...items, ...attached]); setDirty(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not attach this file."); }
    finally { setBusy(false); lock.current = false; if (fileInput.current) fileInput.current.value = ""; }
  }
  async function save(sending: boolean) {
    if (lock.current || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const recipients = validateComposition(message, sending);
      if (sending) {
        const { data, error: protectionError } = await getSupabaseBrowserClient().rpc("send_recipient_protection", { p_emails: recipients.map((address) => address.toLowerCase()) });
        if (protectionError || !data) throw new Error("Recipient safety checks are unavailable. Try again later; no email has been sent.");
        if ((data.suppressed ?? []).length) throw new Error(`These recipients are blocked by your suppression list: ${data.suppressed.join(", ")}`);
      }
      if (sending && !draftId.current) {
        // A new email needs only Mail.Send: saving a Microsoft draft is optional.
        await client.sendNew(message);
      } else {
        const saved = await client.save(message, draftId.current);
        draftId.current = saved.id; setSavedDraftId(saved.id); setExisting((items) => [...items, ...files.map((file, index) => ({ id: `saved-${index}`, name: file.name, size: file.size }))]); setFiles([]);
        if (sending) await client.send(saved.id, message);
      }
      setDirty(false); onSaved(sending ? "sent" : "draft"); onClose();
    } catch (failure) {
      if (failure instanceof UncertainSendError) setUncertain(true);
      setError(failure instanceof Error ? failure.message : "Could not complete this email action.");
    } finally { lock.current = false; setBusy(false); }
  }
  const content = <>
    <div ref={contentRef} className="space-y-5" aria-busy={busy}>
      {!review && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="min-w-0 break-all"><span className="text-[var(--muted-foreground)]">From</span> <strong>{sender}</strong></p>{!standalone && <Button variant="ghost" size="sm" onClick={() => setExtra(!extra)}>{extra ? "Hide Cc / Bcc" : "Add Cc / Bcc"}</Button>}</div>
      <fieldset disabled={busy || uncertain} className="space-y-4">
        <div><Label htmlFor="compose-to">To</Label><Input id="compose-to" value={to} onChange={(event) => { setTo(event.target.value); setDirty(true); }} placeholder="name@example.com" autoFocus /><p className="mt-1 text-xs text-[var(--muted-foreground)]">Separate email addresses with commas or semicolons.</p></div>
        {extra && <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="compose-cc">Cc — visible to all recipients</Label><Input id="compose-cc" value={cc} onChange={(event) => { setCc(event.target.value); setDirty(true); }} /></div><div><Label htmlFor="compose-bcc">Bcc — hidden from other recipients</Label><Input id="compose-bcc" value={bcc} onChange={(event) => { setBcc(event.target.value); setDirty(true); }} /></div></div>}
        <div><Label htmlFor="compose-subject">Subject</Label><Input id="compose-subject" maxLength={255} value={subject} onChange={(event) => { setSubject(event.target.value); setDirty(true); }} /></div>
      </fieldset>
      {parts.protectedOriginal && <p className="rounded-md border bg-[var(--muted)] p-3 text-sm leading-6">The original message is kept below your new text, including its formatting. To edit that original content or attachments, open this draft in Outlook.</p>}
      <div className={busy || uncertain ? "pointer-events-none opacity-60" : ""} inert={busy || uncertain}><RichEmailEditor value={body} onChange={(html) => { setBody(html); setDirty(true); }} showPlaceholders={false} /></div>
      {quote && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-semibold">Original content included below your message</summary><div className="mt-3"><MailBody html={quote} title="Original quoted message" /><Button className="mt-3" variant="outline" disabled={busy || uncertain} onClick={() => { if (window.confirm("Remove the original content from this draft?")) { setQuote(""); setDirty(true); } }}>Remove original content</Button></div></details>}
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signature} disabled={busy || uncertain || !fields.length} onChange={(event) => { setSignature(event.target.checked); setDirty(true); }} />Include my signature</label><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={busy || uncertain || Boolean(savedDraftId)}><Paperclip size={15} />Attach files</Button><input ref={fileInput} aria-label="Attach files" type="file" multiple className="hidden" onChange={(event) => void attach(event.target.files)} /><span className="text-xs text-[var(--muted-foreground)]">Attachments: up to 2 MB total. Saving a draft is optional and asks for extra Microsoft permission.</span></div>
      {(files.length > 0 || existing.length > 0) && <ul className="space-y-2 text-sm">{existing.map((file) => <li key={file.id} className="break-all rounded-md border px-3 py-2">{file.name} · {(file.size / 1024).toFixed(0)} KB · already on draft</li>)}{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"><span className="min-w-0 break-all">{file.name} · {(file.size / 1024).toFixed(0)} KB</span><Button aria-label={`Remove ${file.name}`} size="icon" variant="ghost" disabled={busy || uncertain} onClick={() => { setFiles(files.filter((_, position) => position !== index)); setDirty(true); }}><X size={14} /></Button></li>)}</ul>}
      </>}
      {attachmentError && <p role="alert" className="text-sm text-[var(--danger)]">{attachmentError}</p>}
      {error && <p role="alert" className="rounded-md border border-[var(--danger)] p-3 text-sm leading-6 text-[var(--danger)]">{error}</p>}
      {uncertain && <p className="rounded-md border p-4 text-sm leading-6">The send result is unknown. Do not send again until you check Sent Items and the recipient inbox. Open Sent in your mailbox to investigate before starting another email.</p>}
      {!review ? <div className="flex flex-wrap gap-3 border-t pt-4"><Button disabled={busy || uncertain || Boolean(attachmentError)} onClick={() => { try { validateComposition(message); setError(""); setReview(true); } catch (failure) { setError((failure as Error).message); } }}><Send size={16} />Review and send</Button><Button variant="outline" disabled={busy || uncertain} onClick={() => void save(false)}><Save size={16} />{busy ? "Saving…" : standalone ? "Save draft" : "Save draft and close"}</Button><Button variant="ghost" onClick={close} disabled={busy}>{standalone ? "Clear email" : "Close"}</Button><p className="w-full text-xs leading-5 text-[var(--muted-foreground)]">Manual emails send real mail after confirmation, even in campaign practice mode. They appear in Microsoft Sent Items, not campaign history.</p></div> : <div className="space-y-4 rounded-md border bg-[var(--surface-hover)] p-4"><h3 className="flex items-center gap-2 font-semibold"><Eye size={17} />Confirm one real email</h3><p className="break-all text-sm">From: {sender}<br />To: {to}{cc && <><br />Cc: {cc}</>}{bcc && <><br />Bcc: {bcc}</>}</p><p className="break-words text-sm font-semibold">Subject: {subject}</p><p className="text-xs">{parseAddresses(to).length + parseAddresses(cc).length + parseAddresses(bcc).length} recipient(s) · {files.length + existing.length} attachment(s)</p>{(files.length > 0 || existing.length > 0) && <ul className="space-y-1 text-xs text-[var(--muted-foreground)]">{[...existing, ...files].map((file, index) => <li key={`${file.name}-${index}`} className="break-all">{file.name} · {(file.size / 1024).toFixed(0)} KB</li>)}</ul>}<MailBody html={message.html} title="Email send preview" /><div className="flex flex-wrap gap-3"><Button disabled={busy || uncertain || Boolean(attachmentError)} onClick={() => void save(true)}>{busy ? "Sending…" : "Confirm — send real email"}</Button><Button variant="outline" disabled={busy || uncertain} onClick={() => setReview(false)}>Back to editing</Button></div></div>}
    </div>
  </>;
  return standalone ? <section aria-label="New email" className="surface-card min-w-0 border p-4 sm:p-6">{content}</section> : <Dialog title={draft ? "Continue your draft" : "New email"} onClose={close} wide>{content}</Dialog>;
}
