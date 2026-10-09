"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { SquarePen } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MailComposer } from "./mail-composer";
import { createMailboxClient } from "@/lib/microsoft/mailbox";
import { createMailboxPreview } from "@/lib/ui-preview/mailbox";
import { isUiTestMode } from "@/lib/config/ui-test-mode";
import type { MicrosoftIntegration, SignatureField } from "@/types";

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export function ComposeWorkspace({ integration, signatureFields = [], setupError = "", designPreview = false }: { integration?: MicrosoftIntegration | null; signatureFields?: SignatureField[]; setupError?: string; designPreview?: boolean }) {
  // The email editor and sanitizer require the browser. Never render them during SSR.
  const mounted = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const preview = designPreview && isUiTestMode();
  const connected = preview || integration?.connection_status === "connected" && Boolean(integration.connected_email && integration.home_account_id && integration.client_id && integration.tenant_id);
  const sender = preview ? "demo@example.com" : integration?.connected_email ?? "";
  const client = useMemo(() => preview ? createMailboxPreview() : connected && integration ? createMailboxClient(integration) : null, [connected, integration, preview]);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  return <main className="page-shell">
    <PageHeader eyebrow="Your connected sender" title="Compose email" description="Write a message, review it, and send. Inbox access is not required." actions={<ButtonLink href={preview ? "/inbox?preview=1" : "/inbox"} variant="outline">Open mail</ButtonLink>} />
    {preview && <p role="note" className="mb-4 rounded-md border bg-[var(--info-soft)] p-4 text-sm leading-6">Design preview — fictional sender only. Real sending is disabled. Draft changes are temporary and disappear on reload.</p>}
    {notice && <p role="status" className="mb-4 rounded-md border bg-[var(--info-soft)] p-4 text-sm leading-6">{notice}</p>}
    {setupError && <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{setupError}</p>}
    {!client ? <section className="surface-card space-y-4 border p-6 sm:p-8"><SquarePen size={30} className="text-[var(--primary)]" /><h2 className="text-lg font-semibold">Connect your mailbox first</h2><p className="max-w-xl text-sm leading-7 text-[var(--muted-foreground)]">Choose a Microsoft email in Settings. That connected address becomes your sender automatically. You can send to Microsoft, Gmail, or other email addresses.</p><ButtonLink href="/settings#microsoft">Connect Microsoft email</ButtonLink></section> : mounted ? <>
      <MailComposer key={revision} standalone client={client} sender={sender} fields={signatureFields} onClose={() => setRevision((value) => value + 1)} onSaved={(kind) => setNotice(kind === "sent" ? "Microsoft accepted your email for sending. Check Sent for the result; acceptance does not guarantee delivery." : preview ? "Preview draft saved temporarily. Real Microsoft drafts require additional permission." : "Draft saved to your connected Microsoft mailbox. Find it under Mail → Drafts.")} />
      <p className="mt-4 text-xs leading-6 text-[var(--muted-foreground)]">Sending a new email uses Mail.Send only. Saving or editing Microsoft drafts needs the optional Mail.ReadWrite permission. <Link href="/help/permissions" className="underline">Microsoft permission guide</Link></p>
    </> : <p role="status" className="p-6 text-sm text-[var(--muted-foreground)]">Opening your email editor…</p>}
  </main>;
}
