"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, LoaderCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailBody } from "@/components/mail/mail-body";
import { localDateTime, SCHEDULE_LIMITS, validScheduleTime } from "@/lib/scheduling/core";
import { schedulingRequest, type SchedulePreview, type BackgroundStatus, type SchedulerHealth } from "@/lib/scheduling/client";

export function ScheduleDialog({ datasetId, rowIds, duplicatePolicy, onClose, includeEngagement: initialEngagement = true }: { includeEngagement?: boolean; datasetId: string; rowIds: string[]; duplicatePolicy: string; onClose: () => void }) {
  const router = useRouter();
  const [includeEngagement, setIncludeEngagement] = useState(initialEngagement);
  const [data, setData] = useState<{ preview: SchedulePreview; health: SchedulerHealth; connection: BackgroundStatus }>();
  const [time, setTime] = useState(() => localDateTime(new Date(Date.now() + 15 * 60000)));
  const [bounds] = useState(() => ({ min: localDateTime(new Date(Date.now() + 6 * 60000)), max: localDateTime(new Date(Date.now() + 30 * 86400000)) }));
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<SchedulePreview["items"][number]>();
  const [requestKey] = useState(() => crypto.randomUUID()); const lock = useRef(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    schedulingRequest<typeof data>("/api/schedules/preview", { method: "POST", body: JSON.stringify({ includeEngagement, datasetId, rowIds, duplicatePolicy }), signal: controller.signal }).then(setData).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not review these emails."); });
    return () => controller.abort();
  }, [datasetId, rowIds, duplicatePolicy, reload, includeEngagement]);
  const ready = !!data?.preview.readyCount && data.health.enabled && data.health.healthy && (!data.preview.live || data.connection.connected);
  async function save() {
    if (!data || !ready || !confirmed || lock.current) return;
    setError("");
    try {
      const date = new Date(time);
      if (Number.isNaN(date.valueOf()) || localDateTime(date) !== time) throw new Error("This local time does not exist. Choose another time.");
      const scheduledAt = validScheduleTime(date.toISOString(), timezone);
      lock.current = true; setBusy(true);
      const result = await schedulingRequest<{ id: string }>("/api/schedules", { method: "POST", body: JSON.stringify({ includeEngagement, datasetId, rowIds, duplicatePolicy, scheduledAt, timezone, expectedHash: data.preview.hash, requestKey, confirmed: true }) });
      router.push(`/scheduled?batch=${result.id}`); router.refresh(); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this schedule. Refresh Scheduled emails before retrying."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Dialog title="Schedule for later" wide dismissible={!busy} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">Review the emails, choose a start time, and confirm. Your browser can be closed afterward. Sending starts around that time—not at an exact guaranteed second.</p>
        {error && <p role="alert" className="rounded-lg border bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error}</p>}
        {!data && !error && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle size={16} className="animate-spin" />Checking recipients and preparing your review…</p>}
        {data && <>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" role="switch" aria-checked={includeEngagement} checked={includeEngagement} disabled={busy} onChange={event => { setIncludeEngagement(event.target.checked); setData(undefined); setConfirmed(false); setError(""); }} /><span>Include the engagement button if enabled in Settings. The reviewed appearance and destination stay fixed for this schedule.</span></label>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge tone={data.preview.live ? "danger" : "info"}>{data.preview.live ? "Real emails" : "Practice — no emails sent"}</Badge><Badge tone="success">{data.preview.readyCount} ready</Badge><Badge tone="warning">{data.preview.blockedCount} left out</Badge></div><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setConfirmed(false); setData(undefined); setError(""); setReload((value) => value + 1); }}>Refresh checks</Button></div>
          <dl className="grid gap-3 rounded-lg border bg-[var(--surface-hover)] p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--muted-foreground)]">Spreadsheet</dt><dd className="mt-1 break-words font-semibold">{data.preview.datasetName}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">From</dt><dd className="mt-1 break-all font-semibold">{data.preview.senderEmail || (data.preview.live ? "Not connected" : "Not needed for practice")}</dd></div></dl>
          {(!data.health.enabled || !data.health.healthy) && <p role="alert" className="rounded-lg border bg-[var(--warning-soft)] p-4 text-sm">Scheduled sending is {data.health.enabled ? "waiting for its background worker" : "paused by the administrator"}. You cannot confirm until it is ready. <Link className="underline" href="/help/scheduled-emails">Setup and safety guide</Link></p>}
          {data.preview.live && !data.connection.connected && <div className="rounded-lg border p-4 text-sm"><p>Enable background access for your Microsoft sender once before scheduling real emails.</p><ButtonLink className="mt-3" href="/scheduled" target="_blank" rel="noopener noreferrer">Set up background access</ButtonLink><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">Opens another tab so your selection stays here. After enabling access there, choose Refresh checks here.</p></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="schedule-start">Start sending on</Label><Input id="schedule-start" type="datetime-local" value={time} disabled={busy} min={bounds.min} max={bounds.max} onChange={(event) => { setTime(event.target.value); setConfirmed(false); }} /></div><div className="self-center text-xs leading-6 text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">Timezone: {timezone}</strong><br />Uses your device’s timezone. Choose 5 minutes to 30 days ahead.</div></div>
          <p className="rounded-lg border p-4 text-xs leading-6 text-[var(--muted-foreground)]">The reviewed emails are saved as a snapshot. Later template or spreadsheet edits do not change them. Your do-not-email list and sending permission are checked again. Up to {SCHEDULE_LIMITS.recipients} recipients per schedule; small batches run over several minutes. Delays over 15 minutes pause for your review. Microsoft acceptance does not guarantee delivery.</p>
          <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5 shrink-0" type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>{data.preview.live ? `I reviewed these emails and authorize automatic sending to the ${data.preview.readyCount} ready recipients at the chosen time.` : "I understand this is a scheduled practice run. No real emails will be sent."} Blocked rows are left out.</span></label>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-4"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button disabled={busy || !confirmed || !ready} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <CalendarClock size={16} />}{data.preview.live ? `Confirm schedule · ${data.preview.readyCount} emails` : "Confirm practice schedule"}</Button></div>
          <div className="table-frame max-h-80" role="region" aria-label="Emails to schedule" tabIndex={0}><table className="data-table w-full min-w-[850px]"><thead><tr><th>Row</th><th>Recipient</th><th>Email content</th><th>Result</th><th>Preview</th></tr></thead><tbody>{data.preview.items.map((item) => <tr key={item.row_id}><td>{item.row_number}</td><td>{item.recipient_email || "Missing email"}</td><td>{item.template_name}</td><td><Badge tone={item.status === "ready" ? "success" : "warning"}>{item.status === "ready" ? "Ready" : "Left out"}</Badge>{(item.note || item.warning) && <p className="mt-2 max-w-80 text-xs leading-5 text-[var(--muted-foreground)]">{item.note || item.warning}</p>}</td><td><Button variant="ghost" size="sm" aria-label={`Preview scheduled email for row ${item.row_number}`} onClick={() => setPreview(item)}><Eye size={15} />Preview</Button></td></tr>)}</tbody></table></div>
        </>}
      </div>
    </Dialog>
    {preview && <Dialog title={`Scheduled email preview · row ${preview.row_number}`} onClose={() => setPreview(undefined)}><p className="mb-3 break-all text-sm">To: {preview.recipient_email || "Missing email"}</p><h3 className="mb-4 break-words font-semibold">{preview.subject || "No subject"}</h3><MailBody html={preview.html_body} title="Scheduled email content" /></Dialog>}
  </>;
}
