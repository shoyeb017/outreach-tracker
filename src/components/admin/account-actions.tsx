"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountActions({ id, email, protectedAccount, connected, cleanup, available }: { id: string; email: string | null; protectedAccount: boolean; connected: boolean; cleanup: boolean; available: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<"delete" | "disconnect" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function open(value: "delete" | "disconnect") { setAction(value); setError(""); setConfirmation(""); setAcknowledged(false); }
  function close() { if (!pending) setAction(null); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending || !action) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "delete" ? { confirmation: confirmation.trim(), acknowledged } : {}) }) });
      const result = await response.json().catch(() => ({ error: "The server did not confirm completion. Refresh the account to check its cleanup status before retrying." }));
      if (!response.ok || !result.ok) throw new Error(result.error || "The action was not completed. Refresh and check its status before retrying.");
      setAction(null);
      if (action === "delete") router.push("/admin/users?deleted=1");
      else setNotice("Saved sender disconnected. The user must reconnect in Settings before sending again.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed. Refresh and check the account status."); router.refresh(); }
    finally { setPending(false); }
  }
  if (protectedAccount) return <p className="admin-notice">Administrator account protected. Its sender and account cannot be changed here.</p>;
  if (!available) return <p role="alert" className="admin-notice">Account controls are unavailable. Apply the admin-controls migration and check database access.</p>;
  return <div>
    <div className="grid gap-5 md:grid-cols-2">
      <section className="admin-action-box"><Unplug size={20} className="text-[var(--primary)]" /><h3 className="mt-3 font-semibold">Disconnect saved sender</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Clear this workspace’s saved Microsoft connection. Keep its templates, spreadsheets, and history.</p><Button className="mt-4" variant="outline" onClick={() => open("disconnect")} disabled={!connected || cleanup}>Disconnect sender</Button></section>
      <section className="admin-action-box"><Trash2 size={20} className="text-[var(--danger)]" /><h3 className="mt-3 font-semibold">{cleanup ? "Finish account cleanup" : "Delete account permanently"}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Remove sign-in access, workspace data, imported files, and signature images. Shared system templates stay intact.</p><Button className="mt-4" variant="danger" onClick={() => open("delete")} disabled={!email}>{cleanup ? "Retry account cleanup" : "Delete account"}</Button>{!email && <p className="mt-2 text-xs">Accounts without an email require manual administrator support.</p>}</section>
    </div>
    {notice && <p role="status" className="admin-notice mt-4">{notice}</p>}
    {action && <Dialog title={action === "delete" ? "Permanently delete this account?" : "Disconnect this sender?"} onClose={close} dismissible={!pending}>
      <form onSubmit={submit} className="space-y-5">
        <p className="break-all text-sm">Account: <strong>{email}</strong></p>
        {action === "delete" ? <>
          <p className="text-sm leading-6">This cannot be undone. The account, personal templates and versions, spreadsheets and recipients, campaigns, history, signature, settings, and uploaded files will be removed.</p>
          <div className="admin-notice text-sm leading-6">Audit records are retained. Old emails may lose linked signature images. This does not delete the Microsoft mailbox or emails already sent. Stop active sending first; an in-flight Microsoft request cannot be recalled.</div>
          <div><Label htmlFor="delete-confirmation">Type the account email to confirm</Label><Input id="delete-confirmation" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} /></div>
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 shrink-0 accent-[var(--primary)]" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={pending} />I understand that this permanently removes the account and its data.</label>
        </> : <p className="text-sm leading-6">The user will need to reconnect Microsoft in Settings. This does not revoke Microsoft consent or recall messages already being sent.</p>}
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        {pending && <p role="status" className="text-sm">{action === "delete" ? "Locking the workspace and removing its files and data. Keep this page open." : "Disconnecting the saved sender…"}</p>}
        <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" variant={action === "delete" ? "danger" : "default"} disabled={pending || (action === "delete" && (!acknowledged || confirmation.trim().toLowerCase() !== email?.toLowerCase()))}>{pending && <LoaderCircle size={16} className="animate-spin" />}{action === "delete" ? "Permanently delete account" : "Confirm disconnect"}</Button></div>
      </form>
    </Dialog>}
  </div>;
}
