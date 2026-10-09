"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserPreferences } from "@/types";

export function SendingSettings({ preferences }: { preferences: Partial<UserPreferences> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState(preferences.live_sending_enabled ?? false);
  const [concurrency, setConcurrency] = useState(preferences.send_concurrency ?? 1);
  const [delay, setDelay] = useState(preferences.delay_between_sends_ms ?? 1000);
  const [duplicate, setDuplicate] = useState(preferences.duplicate_policy ?? "block_template_recipient");
  const [subject, setSubject] = useState(preferences.default_subject_strategy ?? "spreadsheet_fallback");
  const [keep, setKeep] = useState(preferences.keep_original_file ?? false);
  const [testRecipient, setTestRecipient] = useState(preferences.send_test_recipient ?? "");

  function toggleLive(next: boolean) {
    if (next && !window.confirm("Enable LIVE SENDING? Microsoft Graph will send real external email after the final send confirmation.")) return;
    setLive(next);
  }

  async function save() {
    if (pending) return;
    if (!Number.isFinite(delay) || delay < 0 || delay > 60000) return toast.error("Choose a delay between 0 and 60,000 milliseconds.");
    setPending(true);
    try {
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in again to save.");
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      live_sending_enabled: live,
      send_concurrency: concurrency,
      delay_between_sends_ms: delay,
      duplicate_policy: duplicate,
      default_subject_strategy: subject,
      keep_original_file: keep,
      send_test_recipient: testRecipient || null,
    }, { onConflict: "user_id" });
    if (error) throw error;
    toast.success("Sending preferences saved."); router.refresh();
    } catch { toast.error("Could not save preferences. Please try again."); }
    finally { setPending(false); }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mx-auto max-w-3xl">
      <Card id="sending">
        <CardHeader className="px-6 py-5 sm:px-8"><CardTitle>Sending preferences</CardTitle><p className="mt-2 text-sm text-[var(--muted-foreground)]">Practice first. Enable real sending when you are ready.</p></CardHeader>
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Sending mode</h3>
            <label className={`flex items-start gap-3 rounded-xl border p-4 ${live ? "border-[var(--border)] bg-[var(--muted)]" : "bg-[var(--surface-hover)]"}`}>
              <input className="mt-1" type="checkbox" checked={live} onChange={(event) => toggleLive(event.target.checked)} />
              <span><strong className="flex items-center gap-2">Send real emails {live && <AlertTriangle size={15} className="text-[var(--danger)]" />}</strong><span className="mt-1 block text-sm text-[var(--muted-foreground)]">{live ? "Real sending will be available after saving. You still review and confirm each send." : "Practice mode: review messages and record results without sending any email."}</span></span>
            </label>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">Save your preferences to apply this choice. Connecting a mailbox does not enable real sending by itself.</p>
          </div>
          <div className="border-t pt-5">
            <h3 className="text-sm font-semibold">Defaults for email reviews</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">You can adjust these choices in a spreadsheet before sending.</p>
            <div className="mt-6 space-y-7">
              <div><Label htmlFor="default-duplicate-policy">If the same person gets the same template again</Label><Select id="default-duplicate-policy" value={duplicate} onChange={(event) => setDuplicate(event.target.value as typeof duplicate)}><option value="block_template_recipient">Block the repeat email (recommended)</option><option value="warn">Show a warning, but allow it</option><option value="allow">Allow repeat emails</option></Select><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Allow can be useful when several test rows share one inbox. Block protects against repeating a template for the same address.</p></div>
              <div><Label htmlFor="default-subject-strategy">Where should the email subject come from?</Label><Select id="default-subject-strategy" value={subject} onChange={(event) => setSubject(event.target.value as typeof subject)}><option value="spreadsheet_fallback">Spreadsheet, or template if blank</option><option value="template">Email template</option><option value="spreadsheet">Spreadsheet only</option></Select><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Choose the source during spreadsheet setup. Using a spreadsheet subject requires a subject column.</p></div>
              <div className="md:col-span-2"><Label htmlFor="default-test-recipient">Test email address · optional</Label><Input id="default-test-recipient" type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="test@example.com" /><p className="mt-2 text-xs text-[var(--muted-foreground)]">Prefills the address for test emails. It does not replace your selected recipients.</p></div>
            </div>
          </div>
          <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Advanced settings <span className="font-normal text-[var(--muted-foreground)]">· sending speed and file retention</span></summary>
            <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">The default speed is suitable for getting started. These controls do not bypass Microsoft sending limits.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="send-concurrency">Emails processed at once</Label><Input id="send-concurrency" type="number" min={1} max={3} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Math.min(3, Number(event.target.value))))} /><p className="mt-1 text-xs text-[var(--muted-foreground)]">Choose 1–3. Recommended: 1.</p></div>
              <div><Label htmlFor="send-delay">Pause between sends (milliseconds)</Label><Input id="send-delay" type="number" min={0} max={60000} step={100} value={delay} onChange={(event) => setDelay(Number(event.target.value))} /><p className="mt-1 text-xs text-[var(--muted-foreground)]">1,000 milliseconds = 1 second.</p></div>
            </div>
            <label className="mt-5 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} /><span>Keep original uploaded files by default<span className="mt-1 block text-xs text-[var(--muted-foreground)]">Imported rows remain available even when you do not keep the original file.</span></span></label>
          </details>
          <div className="flex items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-[var(--muted-foreground)]">Changes apply after saving.</p><Button type="submit" disabled={pending}><Save size={15} />{pending ? "Saving…" : "Save preferences"}</Button></div>
        </CardContent>
      </Card>
    </form>
  );
}
