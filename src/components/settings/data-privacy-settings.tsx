"use client";

import { useState } from "react";
import { Trash2, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface Suppression { id: string; email: string; email_normalized?: string; reason: string; notes: string | null; created_at: string }
export function DataPrivacySettings({ initialSuppressions }: { initialSuppressions: Suppression[] }) {
  const router = useRouter(); const [rows, setRows] = useState(initialSuppressions); const [email, setEmail] = useState(""); const [reason, setReason] = useState("Manually suppressed");
  async function add() { const normalized = email.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(normalized)) return toast.error("Enter a valid email address."); const supabase = getSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data, error } = await supabase.from("suppression_list").upsert({ user_id: user.id, email: email.trim(), email_normalized: normalized, reason: reason.trim() || "Manually suppressed" }, { onConflict: "user_id,email_normalized" }).select("*").single(); if (error) toast.error(error.message); else { setRows((current) => [data, ...current.filter((item) => item.id !== data.id)]); setEmail(""); toast.success("Recipient suppressed."); } }
  async function remove(id: string) { const { error } = await getSupabaseBrowserClient().from("suppression_list").delete().eq("id", id); if (error) toast.error(error.message); else setRows((current) => current.filter((item) => item.id !== id)); }
  async function deleteData() { const phrase = window.prompt("This deletes all datasets, templates, history, Microsoft configuration, signature fields, and preferences. Type DELETE MY DATA to continue."); if (phrase !== "DELETE MY DATA") return; const supabase = getSupabaseBrowserClient(); const { error } = await supabase.rpc("delete_my_application_data"); if (error) toast.error(error.message); else { toast.success("Application data deleted. Your login account remains active."); router.push("/onboarding"); router.refresh(); } }
  return <div className="mx-auto max-w-3xl space-y-8">
    <Card id="privacy"><CardHeader><CardTitle>Do not email list</CardTitle><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Addresses on this list are blocked from sending, even if they appear in a spreadsheet. Use it for opt-outs and people who should not be contacted.</p></CardHeader><CardContent>
      <form onSubmit={(event) => { event.preventDefault(); void add(); }} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div><Label htmlFor="blocked-email">Email address to block</Label><Input id="blocked-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" /></div>
        <div><Label htmlFor="blocked-reason">Reason</Label><Input id="blocked-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <Button type="submit">Block address</Button>
      </form>
      <p className="mt-5 text-xs font-semibold text-[var(--muted-foreground)]">Showing {rows.length} blocked {rows.length === 1 ? "address" : "addresses"} · initially loads the latest 50</p>
      <div className="mt-3 max-h-80 overflow-auto rounded-lg border">{rows.length ? <div className="divide-y">{rows.map((row) => <div className="flex items-center justify-between gap-3 px-4 py-3" key={row.id}><div className="min-w-0"><p className="break-all text-sm font-semibold">{row.email}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.reason} · {formatDate(row.created_at)}</p></div><Button size="sm" variant="outline" aria-label={`Unblock ${row.email}`} onClick={() => { if (window.confirm(`Allow emails to ${row.email} again? This removes the address from your do not email list.`)) void remove(row.id); }}><Trash2 size={14} />Unblock</Button></div>)}</div> : <div className="p-8 text-left"><p className="text-sm font-semibold">No blocked addresses</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Add an address above when someone asks not to receive emails.</p></div>}</div>
    </CardContent></Card>
    <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"><summary className="cursor-pointer font-semibold text-[var(--danger)]">Delete application data</summary><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Permanently deletes your spreadsheets, retained files, templates, send history, blocked addresses, signature, Microsoft configuration, and preferences. This cannot be undone. Your login remains active; deleting it requires your Supabase project administrator.</p><Button className="mt-4" variant="danger" onClick={deleteData}><UserRoundX size={15} />Delete my application data</Button></details>
  </div>;
}
