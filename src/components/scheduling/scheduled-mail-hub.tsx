"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Eye, LoaderCircle, Pause, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailBody } from "@/components/mail/mail-body";
import { formatScheduleTime, localDateTime, scheduleLabels, validScheduleTime, type ScheduledBatch, type ScheduledItem } from "@/lib/scheduling/core";
import { schedulingRequest, type BackgroundStatus, type SchedulerHealth } from "@/lib/scheduling/client";
import { ScheduleTestDialog } from "./schedule-test-dialog";

type BatchSummary = ScheduledBatch & { items: { status: ScheduledItem["status"] }[] };
type Overview = { batches: BatchSummary[]; total: number; page: number; health: SchedulerHealth; connection: BackgroundStatus };
type Detail = { batch: ScheduledBatch; items: ScheduledItem[] };
const finished = ["completed", "completed_with_errors", "cancelled"];
function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  return ["accepted", "simulated", "completed"].includes(status) ? "success" : ["failed", "uncertain", "reconnect_required", "needs_attention"].includes(status) ? "danger" : ["paused", "completed_with_errors", "skipped"].includes(status) ? "warning" : ["scheduled", "running", "pending", "sending"].includes(status) ? "info" : "neutral";
}
function Counts({ items }: { items: { status: ScheduledItem["status"] }[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-6 text-[var(--muted-foreground)]"><span>{items.filter((item) => item.status === "pending").length} pending</span><span>{items.filter((item) => ["accepted", "simulated"].includes(item.status)).length} accepted / practiced</span><span>{items.filter((item) => item.status === "failed").length} failed</span><span>{items.filter((item) => item.status === "uncertain").length} unknown</span><span>{items.filter((item) => ["skipped", "cancelled"].includes(item.status)).length} skipped / cancelled</span></div>;
}
export function ScheduledMailHub({ initialBatch, connectionResult }: { initialBatch?: string; connectionResult?: string }) {
  const [overview, setOverview] = useState<Overview>(); const [detail, setDetail] = useState<Detail>();
  const [view, setView] = useState("upcoming"); const [page, setPage] = useState(1); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(connectionResult === "connected" ? "Background access enabled. New schedules can use it. Previously paused schedules need a new send time." : "");
  const [busy, setBusy] = useState(false); const [secret, setSecret] = useState(""); const [preview, setPreview] = useState<ScheduledItem>();
  const [testOpen, setTestOpen] = useState(false);
  const [reschedule, setReschedule] = useState(false); const [time, setTime] = useState(() => localDateTime(new Date(Date.now() + 15 * 60000)));
  const [confirmAction, setConfirmAction] = useState<"pause" | "cancel" | "disconnect">(); const [resolution, setResolution] = useState<{ id: string; outcome: "accepted" | "not_sent" }>();
  const generation = useRef(0); const detailGeneration = useRef(0); const lock = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const invalidateDetail = useCallback(() => { detailGeneration.current++; }, []);
  const nextDetailRequest = useCallback(() => ++detailGeneration.current, []);
  const detailRequestCurrent = useCallback((version: number) => detailGeneration.current === version, []);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError("");
    try { const result = await schedulingRequest<Overview>(`/api/schedules?view=${view}&page=${page}`); if (generation.current === current) setOverview(result); }
    catch (failure) { if (generation.current === current) setError(failure instanceof Error ? failure.message : "Could not load schedules."); }
    finally { if (generation.current === current) setLoading(false); }
  }, [view, page]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; invalidate(); invalidateDetail(); }; }, [load, invalidate, invalidateDetail]);
  async function open(id: string) {
    if (lock.current) return;
    const current = nextDetailRequest();
    setError(""); setDetail(undefined); setReschedule(false);
    try { const result = await schedulingRequest<Detail>(`/api/schedules/${id}`); if (detailRequestCurrent(current)) setDetail(result); }
    catch (failure) { if (detailRequestCurrent(current)) setError(failure instanceof Error ? failure.message : "Could not open this schedule."); }
  }
  async function refreshDetails(id: string) {
    const current = nextDetailRequest();
    try { const result = await schedulingRequest<Detail>(`/api/schedules/${id}`); if (detailRequestCurrent(current)) { setDetail(result); setError(""); } }
    catch (failure) { if (detailRequestCurrent(current)) setError(failure instanceof Error ? failure.message : "Could not refresh results."); }
  }
  useEffect(() => { if (initialBatch && /^[0-9a-f-]{36}$/i.test(initialBatch)) { const current = nextDetailRequest(); schedulingRequest<Detail>(`/api/schedules/${initialBatch}`).then((value) => { if (detailRequestCurrent(current)) setDetail(value); }).catch(() => { if (detailRequestCurrent(current)) setError("That schedule is unavailable. Choose a schedule below."); }); return invalidateDetail; } }, [initialBatch, nextDetailRequest, detailRequestCurrent, invalidateDetail]);
  async function action(kind: "pause" | "cancel" | "reschedule" | "disconnect" | "resolve") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (kind === "disconnect") await schedulingRequest("/api/microsoft/background", { method: "POST", body: JSON.stringify({ action: "disconnect", confirmed: true }) });
      else if (kind === "resolve" && detail && resolution) await schedulingRequest(`/api/schedules/${detail.batch.id}/resolve`, { method: "POST", body: JSON.stringify({ itemId: resolution.id, outcome: resolution.outcome, confirmed: true }) });
      else if (detail) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date = new Date(time);
        if (kind === "reschedule" && (Number.isNaN(date.valueOf()) || localDateTime(date) !== time)) throw new Error("Choose a valid local time.");
        const scheduledAt = kind === "reschedule" ? validScheduleTime(date.toISOString(), timezone) : undefined;
        await schedulingRequest(`/api/schedules/${detail.batch.id}`, { method: "PATCH", body: JSON.stringify({ action: kind, scheduledAt, timezone, confirmed: true }) });
      }
      setConfirmAction(undefined); setResolution(undefined); setReschedule(false);
      setNotice(kind === "resolve" ? "Your confirmation was recorded. Nothing was resent." : kind === "reschedule" ? "The pending recipients have a new start time. Finished emails will not be resent." : kind === "disconnect" ? "Background access disconnected. Pending real schedules were paused." : `Schedule ${kind === "pause" ? "paused" : "cancelled"}. An email already handed to Microsoft may still complete.`);
      if (detail) setDetail(await schedulingRequest<Detail>(`/api/schedules/${detail.batch.id}`));
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "This action could not be saved. Refresh before retrying."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function connect() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await schedulingRequest<{ url: string }>("/api/microsoft/background/start", { method: "POST", body: JSON.stringify({ clientSecret: secret || undefined }) });
      setSecret("");
      if (!result.url.startsWith("https://login.microsoftonline.com/")) throw new Error("Microsoft authorization URL was not valid.");
      window.location.assign(result.url);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not enable background access."); lock.current = false; setBusy(false); }
  }
  return <main className="page-shell space-y-5">
    <PageHeader eyebrow="Automatic sending" title="Scheduled emails" description="See what will send next, check results, and manage anything that needs attention." actions={<><Button variant="outline" disabled={loading || busy} onClick={() => { void load(); if (detail) void open(detail.batch.id); }}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</Button><ButtonLink href="/datasets">Choose a spreadsheet</ButtonLink></>} />
    {connectionResult === "failed" && <p role="alert" className="rounded-lg border bg-[var(--warning-soft)] p-4 text-sm">Background access was not enabled. Choose the same sending mailbox, check the Web redirect URI and client-secret Value, and approve Mail.Send. Your existing browser connection has not been replaced. <Link href="/help/scheduled-emails" className="underline">Setup guide</Link></p>}
    {error && !detail && !confirmAction && !resolution && <p role="alert" className="rounded-lg border bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error} <Link className="underline" href="/help/scheduled-emails">Setup and troubleshooting</Link></p>}
    {notice && <p role="status" className="rounded-lg border bg-[var(--info-soft)] p-4 text-sm">{notice}</p>}
    {overview && <>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Background access</CardTitle><Badge tone={overview.connection.connected ? "success" : "warning"}>{overview.connection.connected ? "Connected for scheduled sending" : "Not enabled"}</Badge></div></CardHeader><CardContent className="space-y-4">
        <p className="break-all text-sm">Microsoft sender: <strong>{overview.connection.senderEmail || "Not connected"}</strong></p>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">Enable once to send while your browser is closed. AUTMAIL renews access automatically when Microsoft allows it. Microsoft can still require you to reconnect. Signing out of AUTMAIL does not stop confirmed schedules; pausing or disconnecting does.</p>
        {overview.connection.reason && <p className="text-sm text-[var(--muted-foreground)]">{overview.connection.reason}</p>}
        {!overview.connection.connected ? <>
          {!overview.connection.microsoftConnected ? <ButtonLink href="/settings#microsoft">Connect your Microsoft sender first</ButtonLink> : !overview.connection.setupReady ? <p className="rounded-lg border p-4 text-sm">The administrator needs to finish background sending setup. <Link href="/help/scheduled-emails" className="underline">View instructions</Link></p> : <>
            {overview.connection.custom && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-semibold">Your own app registration: background credential</summary><p className="mt-3 text-xs leading-6 text-[var(--muted-foreground)]">Your registration needs the Web redirect URI from the guide and a client secret. Enter the secret Value, not its ID. It is encrypted server-side and never shown again. You do not need this when using the administrator’s default setup.</p><Label htmlFor="background-secret" className="mt-3">Client-secret Value</Label><Input id="background-secret" type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} /></details>}
            <Button disabled={busy || (overview.connection.custom && !secret)} onClick={() => void connect()}><ShieldCheck size={16} />Enable background access</Button>
          </>}
        </> : <Button variant="outline" disabled={busy} onClick={() => setConfirmAction("disconnect")}>Disconnect background access</Button>}
      </CardContent></Card>
      <Card><CardContent className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="text-sm font-semibold">Test scheduled sending</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Enter one recipient and a time. We will schedule a fixed dummy email using your connected sender. No spreadsheet or template needed.</p></div><Button variant="outline" className="shrink-0 self-start" disabled={busy} onClick={() => setTestOpen(true)}>Schedule a test email</Button></CardContent></Card>
      <div role="note" className="rounded-lg border bg-[var(--surface-hover)] p-4 text-xs leading-6 text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">{!overview.health.enabled ? "Scheduled sending is paused by the administrator." : overview.health.healthy ? "Background worker is checking schedules." : "Background worker is offline or delayed. New schedules are blocked."}</strong>{overview.health.lastTickAt && <span> Last check: {new Date(overview.health.lastTickAt).toLocaleString()}.</span>} Supabase Free projects can pause or reach usage limits. Times are approximate; delays over 15 minutes require your review. The app processes up to 5 emails per worker tick and 100 real attempts per user per UTC day. <Link className="underline" href="/help/scheduled-emails">Limits and safety</Link></div>
    </>}
    <nav aria-label="Scheduled email views" className="flex flex-wrap gap-2 border-b pb-3">{[["upcoming", "Upcoming"], ["attention", "Needs attention"], ["history", "History"]].map(([value, label]) => <Button key={value} variant={view === value ? "secondary" : "ghost"} disabled={busy} aria-current={view === value ? "page" : undefined} onClick={() => { setView(value); setPage(1); }}>{label}</Button>)}</nav>
    {loading ? <p role="status" className="flex items-center gap-2 p-5 text-sm"><LoaderCircle size={16} className="animate-spin" />Loading schedules…</p> : overview && <>
      {!overview.batches.length ? <Card><CardContent className="space-y-3 py-10 text-center"><CalendarClock className="mx-auto text-[var(--primary)]" /><h2 className="font-semibold">{view === "upcoming" ? "No upcoming schedules" : view === "attention" ? "Nothing needs attention" : "No scheduled-send history yet"}</h2><p className="mx-auto max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">To schedule, open a spreadsheet, select recipients, and choose Schedule for later under Review &amp; send. Nothing sends until you confirm.</p></CardContent></Card> : <div className="space-y-3">{overview.batches.map((batch) => <Card key={batch.id}><CardContent className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{batch.dataset_name}</h2><Badge tone={statusTone(batch.status)}>{scheduleLabels[batch.status]}</Badge><Badge tone={batch.live_enabled ? "danger" : "info"}>{batch.live_enabled ? "Real emails" : "Practice"}</Badge></div><p className="text-sm">{formatScheduleTime(batch.scheduled_at, batch.timezone)} <span className="text-xs text-[var(--muted-foreground)]">({batch.timezone})</span></p><Counts items={batch.items} />{batch.reason && <p className="max-w-3xl text-xs leading-6 text-[var(--muted-foreground)]">{batch.reason}</p>}</div><Button variant="outline" size="sm" className="shrink-0 self-start" onClick={() => void open(batch.id)}>View details</Button></CardContent></Card>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]"><span>{overview.total} schedules · page {page}. Results update when you refresh.</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * 20 >= overview.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </>}
    {detail && <Dialog title="Schedule details" wide dismissible={!busy} onClose={() => { invalidateDetail(); setDetail(undefined); setReschedule(false); }}><div className="space-y-5">
      {error && !confirmAction && !resolution && <p role="alert" className="rounded-lg border bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error}</p>}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void refreshDetails(detail.batch.id)}><RefreshCw size={14} />Refresh results</Button>
      <div className="flex flex-wrap gap-2"><Badge tone={statusTone(detail.batch.status)}>{scheduleLabels[detail.batch.status]}</Badge><Badge tone={detail.batch.live_enabled ? "danger" : "info"}>{detail.batch.kind === "test" ? "Real test email" : detail.batch.live_enabled ? "Real emails" : "Practice — no emails sent"}</Badge></div>
      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--muted-foreground)]">{detail.batch.kind === "test" ? "Source" : "Spreadsheet"}</dt><dd className="mt-1 break-words font-semibold">{detail.batch.dataset_name}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">From</dt><dd className="mt-1 break-all font-semibold">{detail.batch.sender_email || "Not needed for practice"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-[var(--muted-foreground)]">Start time</dt><dd className="mt-1">{formatScheduleTime(detail.batch.scheduled_at, detail.batch.timezone)} ({detail.batch.timezone})</dd></div></dl>
      <Counts items={detail.items} />
      {detail.batch.reason && <p role="note" className="rounded-lg border bg-[var(--warning-soft)] p-4 text-sm leading-6">{detail.batch.reason}</p>}
      <p className="text-xs leading-6 text-[var(--muted-foreground)]">These are the saved email snapshots. Later edits do not change them. “Accepted by Microsoft” means accepted for sending, not confirmed delivery. Cancelling cannot recall an email already handed to Microsoft.</p>
      {!finished.includes(detail.batch.status) && <div className="flex flex-wrap gap-2">{["scheduled", "running"].includes(detail.batch.status) && <Button variant="outline" disabled={busy} onClick={() => setConfirmAction("pause")}><Pause size={15} />Pause</Button>}<Button variant="outline" disabled={busy || !detail.items.some((item) => item.status === "pending") || detail.items.some((item) => ["sending", "uncertain"].includes(item.status))} onClick={() => setReschedule((value) => !value)}>Choose a new time</Button><Button variant="danger" disabled={busy} onClick={() => setConfirmAction("cancel")}>Cancel remaining emails</Button></div>}
      {reschedule && <div className="space-y-3 rounded-lg border p-4"><Label htmlFor="reschedule-start">New start time</Label><Input id="reschedule-start" type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} /><p className="text-xs leading-6 text-[var(--muted-foreground)]">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Only pending recipients will run. Failed or previously accepted emails are not retried.</p><Button disabled={busy} onClick={() => void action("reschedule")}>Confirm new time for pending recipients</Button></div>}
      <div className="table-frame max-h-[45dvh]" role="region" aria-label="Scheduled recipients and results" tabIndex={0}><table className="data-table w-full min-w-[950px]"><thead><tr><th>Recipient</th><th>Template</th><th>Status</th><th>Details</th><th>Preview</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.recipient_email}</td><td>{item.template_name}</td><td><Badge tone={statusTone(item.status)}>{scheduleLabels[item.status]}</Badge><p className="mt-2 text-xs text-[var(--muted-foreground)]">{item.attempts} attempt(s){item.accepted_at ? ` · ${new Date(item.accepted_at).toLocaleString()}` : ""}</p></td><td><p className="max-w-80 text-xs leading-6 text-[var(--muted-foreground)]">{item.reason || (item.status === "pending" ? "Waiting for its scheduled send or next safe retry." : item.status === "sending" ? "Microsoft request is in progress. Do not retry." : "No issue reported.")}</p>{item.status === "uncertain" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setResolution({ id: item.id, outcome: "accepted" })}>I found it in Sent Items</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setResolution({ id: item.id, outcome: "not_sent" })}>I checked: it was not sent</Button></div>}</td><td><Button variant="ghost" size="sm" aria-label={`Preview email to ${item.recipient_email}`} onClick={() => setPreview(item)}><Eye size={15} />Preview</Button></td></tr>)}</tbody></table></div>
    </div></Dialog>}
    {testOpen && <ScheduleTestDialog onClose={() => setTestOpen(false)} onScheduled={(id) => { setTestOpen(false); setNotice("Test email scheduled. It appears in Upcoming; refresh after the send time to check its result."); void open(id); void load(); }} />}
    {preview && <Dialog title="Saved email preview" onClose={() => setPreview(undefined)}><p className="mb-3 break-all text-sm">To: {preview.recipient_email}</p><h3 className="mb-4 break-words font-semibold">{preview.subject}</h3><MailBody html={preview.html_body} title="Saved scheduled email" /></Dialog>}
    {confirmAction && <Dialog title={confirmAction === "disconnect" ? "Disconnect background access?" : confirmAction === "cancel" ? "Cancel remaining emails?" : "Pause this schedule?"} dismissible={!busy} onClose={() => setConfirmAction(undefined)}>{error && <p role="alert" className="mb-4 rounded-lg border bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{error}</p>}<p className="text-sm leading-7">{confirmAction === "disconnect" ? "This stops background access and pauses pending real schedules. Your normal browser mailbox connection remains available." : confirmAction === "cancel" ? "Pending emails will be cancelled. Already accepted emails cannot be recalled." : "Pending emails will wait until you review and choose a new time."} An email already handed to Microsoft may still complete.</p><div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setConfirmAction(undefined)}>Keep as is</Button><Button disabled={busy} variant="danger" onClick={() => void action(confirmAction)}>Confirm {confirmAction}</Button></div></Dialog>}
    {resolution && <Dialog title="Record your Sent Items check" dismissible={!busy} onClose={() => setResolution(undefined)}>{error && <p role="alert" className="mb-4 rounded-lg border bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{error}</p>}<p className="text-sm leading-7">{resolution.outcome === "accepted" ? "Confirm that you found this exact email in the original sender’s Microsoft Sent Items. We will record acceptance without sending again." : "Confirm that you checked the original sender’s Sent Items and the recipient, and the email was not sent. We will record it as failed—not retry it. If there is any doubt, leave the outcome unknown."}</p><div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setResolution(undefined)}>Leave unknown</Button><Button disabled={busy} onClick={() => void action("resolve")}>Confirm my check — do not send</Button></div></Dialog>}
  </main>;
}
