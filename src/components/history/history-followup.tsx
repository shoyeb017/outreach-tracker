"use client";
import { useRef, useState } from "react";
import { Database, LoaderCircle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engagementRequest } from "@/lib/engagement/client";

export function HistoryFollowup({ ids, onCreated }: { ids: string[]; onCreated: () => void }) {
  const lock = useRef(false);
  const [key, setKey] = useState<string>(), [name, setName] = useState("Email history follow-up"), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; added?: number; omitted?: number }>();
  async function create() {
    if (!key || lock.current || !confirmed || !name.trim()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await engagementRequest<{ id: string; added?: number; omitted?: number }>("/api/history/followup", { method: "POST", body: JSON.stringify({ ids, name: name.trim(), requestKey: key, confirmed: true }) });
      setCreated(result); setKey(undefined); onCreated();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not create spreadsheet. Retry this confirmation to avoid duplicates."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Button disabled={!ids.length || busy} onClick={() => { setKey(crypto.randomUUID()); setConfirmed(false); setError(""); }}><Database size={15} />Create follow-up spreadsheet</Button>
    {created && <div role="status" className="w-full space-y-3 rounded-md border bg-[var(--accent)] p-4 text-sm"><p>Follow-up spreadsheet created. {created.added ?? "Selected"} recipients added{created.omitted ? `; ${created.omitted} duplicate, invalid or blocked selections excluded` : ""}. No email was sent.</p><ButtonLink href={`/datasets/${created.id}?tab=required-setup`}>Choose template and review</ButtonLink></div>}
    {key && <Dialog title="Create a follow-up spreadsheet" dismissible={!busy} onClose={() => { if (!busy) setKey(undefined); }}><div className="space-y-5 text-sm leading-6">
      <p>Copy recipients from {ids.length} selected email results. Duplicate addresses and your do-not-email list are checked automatically. Click activity is not required.</p>
      <p className="text-[var(--muted-foreground)]">Uses the saved engagement snapshot when available, otherwise the source spreadsheet’s current row data. The actual sent-to email address is retained as the recipient. Source columns and personalization connections are copied; old template choices and history are not.</p>
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      <div><Label htmlFor="history-followup-name">New spreadsheet name</Label><Input id="history-followup-name" maxLength={120} disabled={busy} value={name} onChange={event => setName(event.target.value)} /></div>
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Create only. I will choose a template and review before sending or scheduling. Existing duplicate and recipient protections still apply.</span></label>
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setKey(undefined)}>Cancel</Button><Button disabled={busy || !confirmed || !name.trim()} onClick={() => void create()}>{busy && <LoaderCircle size={15} className="animate-spin" />}Create spreadsheet</Button></div>
    </div></Dialog>}
  </>;
}
