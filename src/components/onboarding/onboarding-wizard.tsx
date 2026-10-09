"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function OnboardingWizard({ email, fullName }: { email: string; fullName: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [pending, setPending] = useState(false);
  async function finish(destination: string) {
    if (pending || !name.trim()) return;
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to continue.");
      const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: name.trim(), email, onboarding_completed: true });
      if (error) throw error;
      router.push(destination); router.refresh();
    } catch { toast.error("Could not save your account. Please try again."); setPending(false); }
  }
  return <Card className="mx-auto max-w-3xl"><CardContent className="space-y-7 p-7 md:p-10">
    <div><div className="eyebrow">Welcome</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your first outreach, step by step</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Upload your spreadsheet, choose an email template, review your recipients, and send through your Microsoft account.</p></div>
    <div><Label htmlFor="account-name">What should we call you?</Label><Input id="account-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /><p className="mt-2 text-xs text-[var(--muted-foreground)]">Your account: {email}. This is not the address recipients will see.</p></div>
    <ol className="grid gap-3 sm:grid-cols-3">{[["1", "Upload", "Excel or CSV. A sample file is available."], ["2", "Personalize", "Choose emails and connect company names."], ["3", "Review and practice", "Check the results without sending real emails."]].map(([number, title, copy]) => <li key={number} className="rounded-xl border bg-[var(--surface-hover)] p-4"><span className="text-xs font-bold text-[var(--primary)]">STEP {number}</span><h2 className="mt-2 font-semibold">{title}</h2><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{copy}</p></li>)}</ol>
    <p className="rounded-lg bg-[var(--accent)] p-4 text-sm leading-6 text-[var(--primary)]">Learn in practice mode first. Connect Microsoft and add an optional signature in Settings when you are ready to send real emails.</p>
    <div className="flex flex-wrap justify-between gap-3"><Button variant="ghost" onClick={() => finish("/dashboard")} disabled={pending || !name.trim()}>Go to dashboard</Button><Button onClick={() => finish("/datasets/import")} disabled={pending || !name.trim()}>{pending && <LoaderCircle size={16} className="animate-spin" />}Upload your first spreadsheet</Button></div>
  </CardContent></Card>;
}
