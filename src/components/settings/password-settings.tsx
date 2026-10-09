"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { brandName } from "@/lib/utils";

export function PasswordSettings() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (pending) return;
    setError(""); setSuccess(false);
    if (!current || password.length < 8 || password.length > 200) { setError("Enter your current password and a new password of 8–200 characters."); return; }
    if (password !== confirm) { setError("The new passwords do not match."); return; }
    if (password === current) { setError("Choose a new password different from your current password."); return; }
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error("Sign in again before changing your password.");
      const { data, error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (verifyError || data.user?.id !== user.id) throw new Error("Could not verify your current password. Try again or use password recovery.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword(""); setConfirm(""); setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change your password. Try again or use password recovery."); }
    finally { setCurrent(""); setPending(false); }
  }
  return <Card><CardHeader className="px-6 py-5 sm:px-8"><CardTitle>Change password</CardTitle><p className="mt-2 text-sm text-[var(--muted-foreground)]">Changes your {brandName} login password, not your Microsoft account password.</p></CardHeader><CardContent className="p-6 sm:p-8"><form onSubmit={save} className="space-y-5">
    <fieldset disabled={pending} className="space-y-5"><div><Label htmlFor="account-current-password">Current password</Label><Input id="account-current-password" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></div><div><Label htmlFor="account-new-password">New password</Label><Input id="account-new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} /><p className="mt-2 text-xs text-[var(--muted-foreground)]">At least 8 characters. Your workspace may require a stronger password.</p></div><div><Label htmlFor="account-confirm-password">Confirm new password</Label><Input id="account-confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div></fieldset>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}{success && <p role="status" className="text-sm text-[var(--primary)]">Password changed successfully.</p>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending ? "Changing password…" : "Change password"}</Button><ButtonLink href="/forgot-password" variant="ghost">Forgot your current password?</ButtonLink></div>
  </form></CardContent></Card>;
}
