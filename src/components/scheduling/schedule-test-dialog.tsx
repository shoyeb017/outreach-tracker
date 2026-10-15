"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDateTime, validScheduleTime } from "@/lib/scheduling/core";
import { schedulingRequest, type BackgroundStatus, type SchedulerHealth } from "@/lib/scheduling/client";

type Setup = { health: SchedulerHealth; connection: BackgroundStatus; liveEnabled: boolean; message: { subject: string; text: string } };
export function ScheduleTestDialog({ onClose, onScheduled }: { onClose: () => void; onScheduled: (id: string) => void }) {
  const [setup, setSetup] = useState<Setup>(); const [error, setError] = useState("");
  const [recipient, setRecipient] = useState(""); const [time, setTime] = useState(() => localDateTime(new Date(Date.now() + 10 * 60000)));
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(true);
  const lock = useRef(false); const confirmation = useRef<{ fingerprint: string; key: string } | null>(null); const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    const current = ++generation.current;
    schedulingRequest<Setup>("/api/schedules/test").then((value) => { if (generation.current === current) setSetup(value); }).catch((failure) => { if (generation.current === current) setError(failure instanceof Error ? failure.message : "Could not check scheduled testing."); }).finally(() => { if (generation.current === current) setChecking(false); });
    return invalidate;
  }, [invalidate]);
  async function refresh() {
    if (lock.current) return;
    const current = ++generation.current; setChecking(true); setError(""); setConfirmed(false);
    try { const result = await schedulingRequest<Setup>("/api/schedules/test"); if (generation.current === current) setSetup(result); }
    catch (failure) { if (generation.current === current) setError(failure instanceof Error ? failure.message : "Could not refresh checks."); }
    finally { if (generation.current === current) setChecking(false); }
  }
  const ready = !!setup?.health.enabled && setup.health.healthy && setup.connection.connected && setup.liveEnabled;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || !ready || !confirmed) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const date = new Date(time); const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (Number.isNaN(date.valueOf()) || localDateTime(date) !== time) throw new Error("Choose a valid local time.");
      const scheduledAt = validScheduleTime(date.toISOString(), timezone); const address = recipient.trim().toLowerCase();
      const fingerprint = JSON.stringify([address, scheduledAt, timezone, setup?.connection.senderEmail]);
      if (confirmation.current?.fingerprint !== fingerprint) confirmation.current = { fingerprint, key: crypto.randomUUID() };
      const result = await schedulingRequest<{ id: string }>("/api/schedules/test", { method: "POST", body: JSON.stringify({ recipient: address, scheduledAt, timezone, expectedSender: setup?.connection.senderEmail, confirmed: true, requestKey: confirmation.current.key }) });
      onScheduled(result.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this test. Refresh results before trying again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog title="Schedule a test email" dismissible={!busy} onClose={onClose}>
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">Send one real dummy message to an address you enter. This tests the background worker without uploading a spreadsheet or choosing a template. Use an inbox you control.</p>
      {error && <p role="alert" className="rounded-lg border bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error}</p>}
      {checking && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle size={15} className="animate-spin" />Checking worker and sender…</p>}
      {setup && <>
        <div className="rounded-lg border p-4 text-sm"><span className="text-[var(--muted-foreground)]">From</span><p className="mt-1 break-all font-semibold">{setup.connection.senderEmail || "Connect a Microsoft sender first"}</p></div>
        {!ready && <div role="note" className="space-y-2 rounded-lg border bg-[var(--warning-soft)] p-4 text-sm leading-6">
          {(!setup.health.enabled || !setup.health.healthy) && <p>The background worker is paused or has not checked in. Ask the administrator to finish worker setup. This test cannot bypass it. <Link href="/help/scheduled-emails" target="_blank" rel="noopener noreferrer" className="underline">Setup guide</Link></p>}
          {!setup.connection.connected && <p>Enable background access in Scheduled emails before testing.</p>}
          {!setup.liveEnabled && <p><Link href="/settings#sending" target="_blank" rel="noopener noreferrer" className="underline">Turn on Real sending in Settings</Link>, then refresh checks. This test sends an actual email.</p>}
        </div>}
      </>}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="schedule-test-recipient">Test recipient email</Label><Input id="schedule-test-recipient" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={busy} value={recipient} onChange={(event) => { setRecipient(event.target.value); setConfirmed(false); }} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="schedule-test-time">Send time</Label><Input id="schedule-test-time" className="min-w-0" type="datetime-local" required disabled={busy} value={time} onChange={(event) => { setTime(event.target.value); setConfirmed(false); }} /></div>
      </div>
      <p className="text-xs leading-6 text-[var(--muted-foreground)]">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose 5 minutes to 30 days ahead. Start time is approximate. Up to 5 scheduled tests per user per UTC day, including cancelled tests; normal sending limits also apply.</p>
      {setup && <section className="rounded-lg border p-4"><h3 className="text-xs text-[var(--muted-foreground)]">Dummy email preview</h3><p className="mt-2 break-words text-sm font-semibold">{setup.message.subject}</p><details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">Read dummy message</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-foreground)]">{setup.message.text}</p></details></section>}
      <label className="flex items-start gap-3 rounded-lg border p-4 text-sm leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm that this will send one real test email to the address above at the chosen time.</span></label>
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy || checking} onClick={() => void refresh()}>Refresh checks</Button><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || checking || !ready || !confirmed || !recipient.trim() || !time}>{busy ? "Saving test…" : "Confirm scheduled test email"}</Button></div>
      <p className="text-xs leading-6 text-[var(--muted-foreground)]">After confirmation, check Upcoming, Needs attention, or History. The browser can be closed. Accepted by Microsoft is not proof of delivery; check the recipient inbox and Junk too.</p>
    </form>
  </Dialog>;
}
