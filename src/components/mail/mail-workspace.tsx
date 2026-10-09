"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FilePenLine, Forward, Inbox, Mail, MailOpen, MailWarning, Paperclip, RefreshCw, Reply, ReplyAll, Search, Send, SquarePen } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { MailBody } from "./mail-body";
import { MailComposer } from "./mail-composer";
import { createMailboxClient } from "@/lib/microsoft/mailbox";
import { addressText, outlookLink } from "@/lib/mail/compose";
import type { MailAttachment, MailFolder, MailMessage } from "@/lib/mail/types";
import type { MicrosoftIntegration, SignatureField } from "@/types";
import { createMailboxPreview } from "@/lib/ui-preview/mailbox";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sentitems", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FilePenLine },
  { id: "junkemail", label: "Junk email", icon: MailWarning },
] as const;
function dateLabel(value?: string) { if (!value || Number.isNaN(Date.parse(value))) return ""; return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export function MailWorkspace({ integration, signatureFields = [], initialCompose = false, setupError = "", designPreview = false }: { integration?: MicrosoftIntegration | null; signatureFields?: SignatureField[]; initialCompose?: boolean; setupError?: string; designPreview?: boolean }) {
  const preview = designPreview && isUiTestMode();
  const connected = preview || integration?.connection_status === "connected" && Boolean(integration.connected_email && integration.home_account_id && integration.client_id && integration.tenant_id);
  const sender = preview ? "demo@example.com" : integration?.connected_email ?? "";
  const client = useMemo(() => preview ? createMailboxPreview() : connected && integration ? createMailboxClient(integration) : null, [connected, integration, preview]);
  const [folder, setFolder] = useState<MailFolder>("inbox"); const [messages, setMessages] = useState<MailMessage[]>([]); const [next, setNext] = useState<string>();
  const [selected, setSelected] = useState<MailMessage>(); const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(false); const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState(setupError); const [detailError, setDetailError] = useState(""); const [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""); const [unread, setUnread] = useState(false); const [compose, setCompose] = useState(initialCompose); const [draft, setDraft] = useState<MailMessage>();
  const generation = useRef(0); const detailGeneration = useRef(0); const actionLock = useRef(false);
  const invalidate = useCallback(() => { generation.current++; detailGeneration.current++; }, []);
  const load = useCallback(async (more?: string) => {
    if (!client) return;
    const current = ++generation.current; setLoading(true); setError("");
    try {
      const page = await client.list(folder, more);
      if (current !== generation.current) return;
      setMessages((items) => more ? Array.from(new Map([...items, ...page.messages].map((item) => [item.id, item])).values()) : page.messages);
      setNext(page.next); setReady(true);
    } catch (failure) { if (current === generation.current) { setError(failure instanceof Error ? failure.message : "Could not load your mail."); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [client, folder]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; invalidate(); };
  }, [load, invalidate]);
  async function enable() {
    if (!client || actionLock.current) return;
    actionLock.current = true; setLoading(true); setError("");
    try { await client.enable(); await load(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Mailbox access could not be enabled."); }
    finally { actionLock.current = false; setLoading(false); }
  }
  async function open(message: MailMessage) {
    if (!client || actionLock.current) return;
    const current = ++detailGeneration.current; setSelected(message); setAttachments([]); setDetailError(""); setDetailBusy(true);
    try {
      const [full, files] = await Promise.all([client.get(message.id), message.hasAttachments ? client.attachments(message.id) : Promise.resolve([])]);
      if (current === detailGeneration.current) { setSelected(full); setAttachments(files); }
    } catch (failure) { if (current === detailGeneration.current) setDetailError(failure instanceof Error ? failure.message : "Could not open this message."); }
    finally { if (current === detailGeneration.current) setDetailBusy(false); }
  }
  async function action(kind: "read" | "reply" | "all" | "forward" | "draft") {
    if (!client || !selected || detailBusy || actionLock.current) return;
    actionLock.current = true; setDetailBusy(true); setDetailError("");
    try {
      if (kind === "read") {
        const isRead = !selected.isRead; await client.markRead(selected.id, isRead);
        setSelected({ ...selected, isRead }); setMessages((items) => items.map((item) => item.id === selected.id ? { ...item, isRead } : item));
      } else {
        const writing = kind === "draft" ? selected : kind === "forward" ? await client.startForward(selected.id) : await client.startReply(selected.id, kind === "all");
        setDraft(writing); setCompose(true);
      }
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Could not complete this action."); }
    finally { actionLock.current = false; setDetailBusy(false); }
  }
  async function download(attachment: MailAttachment) {
    if (!client || !selected || actionLock.current) return;
    actionLock.current = true; setDetailBusy(true); setDetailError("");
    try {
      const blob = await client.download(selected.id, attachment); const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = attachment.name.replace(/[\\/\u0000-\u001f]/g, "_"); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Could not download this file."); }
    finally { actionLock.current = false; setDetailBusy(false); }
  }
  function changeFolder(id: MailFolder) { if (actionLock.current || id === folder) return; detailGeneration.current++; setFolder(id); setSelected(undefined); setAttachments([]); setMessages([]); setNext(undefined); setQuery(""); setUnread(false); setDetailError(""); }
  const filtered = messages.filter((item) => (!unread || !item.isRead) && `${item.subject} ${item.from?.emailAddress.name ?? ""} ${item.from?.emailAddress.address ?? ""} ${addressText(item.toRecipients)} ${item.bodyPreview}`.toLowerCase().includes(query.toLowerCase().trim()));
  const external = outlookLink(selected?.webLink);
  const incoming = folder === "inbox" || folder === "junkemail";
  return <main className="page-shell">
    {preview && <p role="note" className="mb-4 rounded-md border bg-[var(--info-soft)] p-4 text-sm leading-6">Design preview — fictional mailbox only. No Microsoft connection or real sending. Draft changes are temporary and disappear on reload.</p>}
    <PageHeader eyebrow="Your Microsoft mailbox" title={initialCompose ? "Compose email" : "Mail"} description="Read your mail and write personal messages, without a spreadsheet or template." actions={<Button disabled={!connected || detailBusy} onClick={() => { setDraft(undefined); setCompose(true); }}><SquarePen size={16} />Compose email</Button>} />
    {!connected ? <section className="surface-card space-y-4 border p-6 sm:p-8"><Inbox size={30} className="text-[var(--primary)]" /><h2 className="text-lg font-semibold">Connect your mailbox first</h2><p className="max-w-xl text-sm leading-7 text-[var(--muted-foreground)]">Connect your personal or work Microsoft email in Settings. Then enable mailbox access here to read Inbox, Sent, Drafts, and Junk email. Gmail and other addresses can receive your messages; they cannot be connected as the sender.</p>{setupError && <p role="alert" className="text-sm text-[var(--danger)]">{setupError}</p>}<ButtonLink href="/settings#microsoft">Connect Microsoft email</ButtonLink><ButtonLink href="/help/permissions" variant="ghost">Understand mailbox permissions</ButtonLink></section> : <>
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3"><p className="min-w-0 break-all text-sm text-[var(--muted-foreground)]">Connected mailbox: <strong className="text-[var(--foreground)]">{sender}</strong></p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={loading || detailBusy} onClick={() => { setNotice(""); void load(); }}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh</Button>{(!ready || error) && <Button size="sm" disabled={loading} onClick={() => void enable()}>Enable mailbox access</Button>}</div></div>
      {!ready && <p className="mb-4 rounded-md border bg-[var(--muted)] p-4 text-sm leading-6">Reading Inbox, Sent, Drafts, and Junk email needs Mail.Read for your own mailbox. Writing a new email does not require inbox access. Saving drafts, reply/forward drafts, and changing read status ask separately for Mail.ReadWrite. Your organization may require admin approval. <Link href="/help/permissions" className="underline">Permission guide</Link></p>}
      {error && <p role="alert" className="mb-4 rounded-md border border-[var(--danger)] p-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-md border p-3 text-sm">{notice}</p>}
      {folder === "junkemail" && <p role="note" className="mb-4 rounded-md border bg-[var(--muted)] p-4 text-sm leading-6">These messages are in your Microsoft Junk email folder. Be careful with unexpected links and attachments. Images stay blocked. To move a message to Inbox or mark it as not junk, open it in Outlook.</p>}
      <div className="mail-workspace surface-card overflow-hidden border">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 sm:px-5"><nav aria-label="Mail folders" className="flex flex-wrap gap-1">{folders.map(({ id, label, icon: Icon }) => <Button key={id} variant={folder === id ? "secondary" : "ghost"} size="sm" aria-current={folder === id ? "page" : undefined} disabled={detailBusy} onClick={() => changeFolder(id)}><Icon size={15} />{label}</Button>)}</nav><span className="text-xs text-[var(--muted-foreground)]">Microsoft folders · not campaign history</span></div>
        <div className="mail-panes">
          <section aria-label="Message list" aria-busy={loading} className={`mail-list min-w-0 ${selected ? "mail-list-with-selection" : ""}`}>
            <div className="space-y-3 border-b p-4"><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[var(--muted-foreground)]" /><Input aria-label="Search loaded messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loaded messages" className="pl-9" /></div><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-[var(--muted-foreground)]">{messages.length} loaded · load more to search older mail</span>{incoming && <label className="flex items-center gap-2"><input type="checkbox" checked={unread} onChange={(event) => setUnread(event.target.checked)} />Unread only</label>}</div></div>
            <div className="mail-list-scroll">{loading && !messages.length ? <p role="status" className="p-6 text-sm text-[var(--muted-foreground)]">Loading your messages…</p> : !filtered.length ? <div className="p-8 text-center"><Mail size={26} className="mx-auto text-[var(--muted-foreground)]" /><p className="mt-3 text-sm font-semibold">{ready ? query || unread ? "No loaded messages match" : "No messages in this folder" : "Your mailbox is not loaded yet"}</p><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">{ready ? "Try another folder, clear your filters, or refresh." : "Enable mailbox access to see your messages."}</p></div> : <ul>{filtered.map((message) => <li key={message.id}><button onClick={() => void open(message)} aria-current={selected?.id === message.id ? "true" : undefined} aria-label={`${message.isRead ? "" : "Unread: "}${message.subject || "(No subject)"}`} className={`mail-list-row focus-ring w-full min-w-0 border-b px-4 py-4 text-left ${selected?.id === message.id ? "bg-[var(--accent)]" : "hover:bg-[var(--surface-hover)]"}`}><div className="flex items-start justify-between gap-3"><span className={`min-w-0 break-words text-sm ${!message.isRead ? "font-bold" : "font-medium"}`}>{incoming ? message.from?.emailAddress.name || message.from?.emailAddress.address || "Unknown sender" : addressText(message.toRecipients) || "No recipients"}</span>{!message.isRead && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />}</div><p className={`mt-1 line-clamp-2 break-words text-sm ${!message.isRead ? "font-semibold" : ""}`}>{message.subject || "(No subject)"}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--muted-foreground)]">{message.bodyPreview}</p><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--muted-foreground)]"><time>{dateLabel(folder === "drafts" ? message.lastModifiedDateTime || message.receivedDateTime : folder === "sentitems" ? message.sentDateTime || message.receivedDateTime : message.receivedDateTime)}</time>{message.hasAttachments && <Paperclip aria-label="Has attachments" size={13} />}</div></button></li>)}</ul>}{next && <div className="p-4"><Button variant="outline" className="w-full" disabled={loading} onClick={() => void load(next)}>{loading ? "Loading…" : "Load more messages"}</Button></div>}</div>
          </section>
          <section aria-label="Message details" aria-busy={detailBusy} className="mail-reading-pane min-w-0">
            {!selected ? <div className="grid min-h-80 place-items-center p-8 text-center"><div><MailOpen size={32} className="mx-auto text-[var(--primary)]" /><h2 className="mt-4 font-semibold">Choose an email to read</h2><p className="mt-2 max-w-xs text-sm leading-6 text-[var(--muted-foreground)]">See sender details, read the message, and reply or forward from your connected mailbox.</p></div></div> : <div className="space-y-5 p-4 sm:p-6"><Button variant="ghost" size="sm" className="mail-back-to-list" onClick={() => { detailGeneration.current++; setSelected(undefined); setDetailBusy(false); }}><ArrowLeft size={15} />Back to messages</Button><div><h2 className="break-words text-xl font-semibold leading-8">{selected.subject || "(No subject)"}</h2><div className="mt-3 space-y-1 break-all text-xs leading-6 text-[var(--muted-foreground)]"><p><strong className="text-[var(--foreground)]">From:</strong> {selected.from?.emailAddress.name} {selected.from?.emailAddress.address}</p><p><strong className="text-[var(--foreground)]">To:</strong> {addressText(selected.toRecipients)}</p>{selected.ccRecipients?.length > 0 && <p><strong>Cc:</strong> {addressText(selected.ccRecipients)}</p>}{selected.bccRecipients && selected.bccRecipients.length > 0 && <p><strong>Bcc:</strong> {addressText(selected.bccRecipients)}</p>}<p>{dateLabel(selected.isDraft ? selected.lastModifiedDateTime || selected.receivedDateTime : folder === "sentitems" ? selected.sentDateTime || selected.receivedDateTime : selected.receivedDateTime)}</p></div></div>
              <div className="flex flex-wrap gap-2">{selected.isDraft ? <Button disabled={detailBusy || !selected.body} onClick={() => void action("draft")}><SquarePen size={15} />Continue draft</Button> : <><Button variant="outline" size="sm" disabled={detailBusy || !selected.body} onClick={() => void action("reply")}><Reply size={15} />Reply</Button><Button variant="outline" size="sm" disabled={detailBusy || !selected.body} onClick={() => void action("all")}><ReplyAll size={15} />Reply all</Button><Button variant="outline" size="sm" disabled={detailBusy || !selected.body} onClick={() => void action("forward")}><Forward size={15} />Forward</Button><Button variant="ghost" size="sm" disabled={detailBusy} onClick={() => void action("read")}>Mark {selected.isRead ? "unread" : "read"}</Button></>}{external && <a href={external} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-[var(--primary)]">Open in Outlook <ExternalLink size={12} /></a>}</div>
              {detailError && <p role="alert" className="rounded-md border p-3 text-sm text-[var(--danger)]">{detailError}<Button className="mt-2" variant="outline" size="sm" disabled={detailBusy} onClick={() => void open(selected)}>Retry opening message</Button></p>}
              {detailBusy && <p role="status" className="text-xs text-[var(--muted-foreground)]">Working with Microsoft…</p>}
              {selected.body && <MailBody html={selected.body.contentType.toLowerCase() === "html" ? selected.body.content : `<pre>${selected.body.content.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`} />}
              {attachments.length > 0 && <div><h3 className="text-sm font-semibold">Attachments</h3><div className="mt-3 flex flex-wrap gap-2">{attachments.map((file) => <Button key={file.id} variant="outline" size="sm" disabled={detailBusy} onClick={() => void download(file)}><Paperclip size={14} /><span className="break-all">{file.name} · {(file.size / 1024).toFixed(0)} KB</span></Button>)}</div><p className="mt-2 text-xs text-[var(--muted-foreground)]">Download only files you trust. Large files and attached Outlook items can be opened in Outlook.</p></div>}
            </div>}
          </section>
        </div>
      </div>
    </>}
    {compose && client && <MailComposer client={client} sender={sender} fields={signatureFields} draft={draft} onClose={() => { setCompose(false); setDraft(undefined); }} onSaved={(kind) => { setNotice(kind === "sent" ? "Microsoft accepted your email for sending. Check Sent; acceptance does not guarantee delivery." : "Draft saved to your connected Microsoft mailbox. Open Drafts to continue."); setSelected(undefined); void load(); }} />}
  </main>;
}
