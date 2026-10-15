"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { schedulingRequest } from "@/lib/scheduling/client";
type Health = { enabled: boolean; healthy: boolean; lastTickAt: string | null; encryptionConfigured: boolean; defaultCredentialConfigured: boolean };
export function SchedulingControls() {
  const [data, setData] = useState<Health>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { try { setData(await schedulingRequest<Health>("/api/admin/scheduling")); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load scheduling controls."); } }
  useEffect(() => { let active = true; schedulingRequest<Health>("/api/admin/scheduling").then((value) => { if (active) setData(value); }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "Could not load scheduling controls."); }); return () => { active = false; }; }, []);
  async function toggle() {
    if (!data || busy || !window.confirm(data.enabled ? "Pause scheduled sending for every user? An email already handed to Microsoft may still complete." : "Enable the background worker to process users’ explicitly confirmed schedules? Real schedules can send while users are offline.")) return;
    setBusy(true); setError("");
    try { await schedulingRequest("/api/admin/scheduling", { method: "PATCH", body: JSON.stringify({ enabled: !data.enabled, confirmed: true }) }); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this change."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg border bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error}</p>}
    <Card><CardHeader><CardTitle>Scheduled sending</CardTitle></CardHeader><CardContent className="space-y-5"><p className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)]">One global switch controls background sends. It starts paused after migration. Configure the worker and verify its heartbeat before enabling it. Pausing does not recall emails already handed to Microsoft.</p>{data && <><div className="flex flex-wrap gap-2"><Badge tone={data.enabled ? "success" : "warning"}>{data.enabled ? "Enabled" : "Paused"}</Badge><Badge tone={data.healthy ? "success" : "danger"}>{data.healthy ? "Worker checking in" : "Worker offline / not set up"}</Badge></div><dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">{[["Last worker check", data.lastTickAt ? new Date(data.lastTickAt).toLocaleString() : "None yet"], ["Encryption key", data.encryptionConfigured ? "Configured in Vercel" : "Missing in Vercel"], ["Default Microsoft credential", data.defaultCredentialConfigured ? "Configured in Vercel" : "Not configured"]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><div className="flex flex-wrap gap-3"><Button disabled={busy || (!data.enabled && (!data.healthy || !data.encryptionConfigured))} variant={data.enabled ? "danger" : "default"} onClick={() => void toggle()}>{data.enabled ? "Pause scheduled sending for everyone" : "Enable scheduled sending"}</Button><Button variant="outline" disabled={busy} onClick={() => void load()}>Refresh health</Button></div></>}<Link href="/help/scheduled-emails" className="inline-block text-sm font-semibold text-[var(--primary)] underline">Setup, Free-plan limits, and recovery guide</Link></CardContent></Card>
    <Card><CardHeader><CardTitle>Supabase Free safeguards</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-[var(--muted-foreground)]"><li>Up to 100 recipients per schedule, 10 active schedules per user, and 30 days ahead.</li><li>At most 5 sequential email attempts per worker tick across the app; 100 real scheduled attempts per user per UTC day. This is an app safety cap, not a promise of Microsoft quota.</li><li>Worker execution is bounded below the Free plan’s 150-second duration. Large batches take multiple ticks.</li><li>A delay over 15 minutes pauses the affected schedule for review. A paused Free project cannot send until restored; do not rely on Free for critical deadlines.</li><li>Network interruptions after a send begins produce an unknown outcome. They are never automatically retried. Explicit throttling gets at most 3 attempts.</li><li>Database usage grows with saved email snapshots and history. Monitor storage and function usage. Free does not include downloadable managed database backups; keep independent exports.</li></ul></CardContent></Card>
  </div>;
}
