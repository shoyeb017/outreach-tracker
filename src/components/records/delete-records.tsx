"use client";
import { useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { engagementRequest } from "@/lib/engagement/client";

export type RecordKind = "engagement" | "history" | "schedule";
const explanation: Record<RecordKind, string> = {
  engagement: "Permanently delete these activity records and recipient snapshots. Their tracking links will stop working. Existing follow-up spreadsheets, email history and Microsoft messages are kept. This does not cancel or recall emails.",
  history: "Remove these entries from Email history. Internal send records are retained so duplicate-send protections keep working. Engagement records, schedules, spreadsheets and Microsoft messages are unchanged. This is list removal, not erasure of all sending data.",
  schedule: "Remove these finished schedules from Scheduled history. Internal sending and safety logs are retained. Email history, engagement records, spreadsheets and Microsoft messages are unchanged. This does not cancel or recall emails.",
};

export function DeleteRecords({ kind, ids, disabled = false, label = "Delete selected", compact = false, onDeleted }: { kind: RecordKind; ids: string[]; disabled?: boolean; label?: string; compact?: boolean; onDeleted: (ids: string[]) => void }) {
  const lock = useRef(false);
  const [target, setTarget] = useState<string[]>(), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove() {
    if (!target?.length || !confirmed || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await engagementRequest("/api/records/delete", { method: "POST", body: JSON.stringify({ kind, ids: target, confirmed: true }) });
      setTarget(undefined); onDeleted(target);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not remove records. Refresh before retrying."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Button variant="danger" size="sm" disabled={disabled || busy || !ids.length} aria-label={label} onClick={() => { setTarget([...ids]); setConfirmed(false); setError(""); }}><Trash2 size={14} />{compact ? "Delete" : label}</Button>
    {target && <Dialog title={`Delete ${target.length} ${kind === "schedule" ? "schedule" : "record"}${target.length === 1 ? "" : "s"}?`} dismissible={!busy} onClose={() => { if (!busy) setTarget(undefined); }}><div className="space-y-5 text-sm leading-6">
      <p>{explanation[kind]}</p>
      <p className="text-[var(--muted-foreground)]">Pending, sending and unknown-outcome records are protected. Cancel remaining sends or resolve uncertain outcomes first. Removal affects only the selected records in this section.</p>
      {error && <p role="alert" className="rounded-md bg-[var(--danger-soft)] p-3 text-[var(--danger)]">{error}</p>}
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{kind === "engagement" ? "I understand that these records and tracking links cannot be restored." : "I understand that these entries will be removed from this list and internal safety logs will remain."}</span></label>
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setTarget(undefined)}>Keep records</Button><Button variant="danger" disabled={busy || !confirmed} onClick={() => void remove()}>{busy && <LoaderCircle size={15} className="animate-spin" />}Confirm deletion</Button></div>
    </div></Dialog>}
  </>;
}
