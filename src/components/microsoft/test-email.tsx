"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendGraphEmail, verifyMicrosoftSender } from "@/lib/microsoft/graph";
import { UncertainSendError } from "@/lib/sending/errors";
import type { MicrosoftIntegration } from "@/types";
import { brandName, productName } from "@/lib/utils";

const testSubject = `${brandName} — test email`;
const testIntroduction = `This is a test message from ${productName} to check that your connected Microsoft mailbox can send email.`;
const testNotice = "No action is needed. This message is not part of an outreach campaign.";

export function TestEmail({ integration, disabled = false, onBusyChange }: { integration?: Partial<MicrosoftIntegration> | null; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const connected = integration?.connection_status === "connected" && !!integration.connected_email && !!integration.tenant_id && !!integration.client_id;
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || disabled || !connected || uncertain) return;
    const to = recipient.trim();
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) { setMessage("Enter one valid test email address."); return; }
    if (!window.confirm(`Send one REAL test email from ${integration!.connected_email} to ${to}? This sends even in practice mode, but does not enable real campaign sending.`)) return;
    lock.current = true; setPending(true); onBusyChange?.(true); setMessage("");
    try {
      const expectedAccount = await verifyMicrosoftSender(integration!.tenant_id!, integration!.client_id!, integration!.connected_email!);
      await sendGraphEmail({ tenantId: integration!.tenant_id!, clientId: integration!.client_id!, expectedAccount, liveEnabled: true, email: { to, subject: testSubject, htmlBody: `<p>Hello,</p><p>${testIntroduction}</p><p>${testNotice}</p>`, saveToSentItems: true } });
      setMessage("Microsoft accepted the test email. Check the recipient inbox and your Sent Items; acceptance does not guarantee delivery.");
    } catch (error) {
      if (error instanceof UncertainSendError) setUncertain(true);
      setMessage(error instanceof Error ? error.message : "Could not send the test email. Check your connection and permissions.");
    } finally { lock.current = false; setPending(false); onBusyChange?.(false); }
  }
  return <Card><CardHeader><CardTitle>Send an actual test email</CardTitle><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Sends one real message to an inbox you control, even in practice mode. Your campaign settings are not changed.</p></CardHeader><CardContent className="space-y-5">
    <p className="break-words text-sm"><span className="font-semibold">From:</span> {connected ? integration?.connected_email : "Connect a sender first"}</p>
    <details className="rounded-xl border bg-[var(--surface-hover)] p-4 text-sm leading-6"><summary className="cursor-pointer font-semibold">View the test message</summary><div className="mt-4"><p className="font-semibold">Subject: {testSubject}</p><p className="mt-3">Hello,</p><p className="mt-2">{testIntroduction}</p><p className="mt-2">{testNotice}</p></div></details>
    <form onSubmit={send} className="space-y-4"><div><Label htmlFor="actual-test-recipient">Test recipient email</Label><Input id="actual-test-recipient" type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Your test inbox" disabled={pending} /></div><Button type="submit" disabled={pending || disabled || !connected || uncertain}>{pending ? "Sending test email…" : "Send real test email"}</Button></form>
    {!connected && <p className="text-xs text-[var(--muted-foreground)]">Connect a Microsoft mailbox first.</p>}
    <p className="text-xs text-[var(--muted-foreground)]">The recipient can be your Gmail, Outlook, or another inbox. The sender must be a supported Microsoft mailbox.</p>
    {message && <p role="status" className="rounded-xl border p-4 text-sm leading-6">{message}</p>}
    {uncertain && <Button variant="outline" onClick={() => { if (window.confirm("Have you checked Sent Items and the recipient inbox? Sending again may create a duplicate.")) { setUncertain(false); setMessage("Result checked. Any further send is a new real test email."); } }}>I have checked Sent Items</Button>}
    <p className="text-xs leading-6 text-[var(--muted-foreground)]">Saved to Microsoft Sent Items, not campaign history. Requires Mail.Send permission. No spreadsheet, template, or signature is used.</p>
  </CardContent></Card>;
}
