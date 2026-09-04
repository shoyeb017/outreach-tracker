"use client";

import { useState } from "react";
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
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
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
    if (error) toast.error(error.message);
    else toast.success("Sending preferences saved.");
  }

  return (
    <Card id="sending">
      <CardHeader>
        <CardTitle>Sending and defaults</CardTitle>
        <p className="mt-1 text-sm text-[#68736f]">Conservative defaults support normal use; they are not designed to bypass provider limits.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className={`flex items-start gap-3 rounded-xl border p-4 ${live ? "border-[#efaaa4] bg-[#fff7f6]" : "bg-[#f7faf8]"}`}>
          <input className="mt-1" type="checkbox" checked={live} onChange={(event) => toggleLive(event.target.checked)} />
          <span>
            <strong className="flex items-center gap-2">Live sending enabled {live && <AlertTriangle size={15} className="text-[#b42318]" />}</strong>
            <span className="mt-1 block text-sm text-[#68736f]">When off, the queue, progress, and history work as simulations and Graph sendMail is never called.</span>
          </span>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="send-concurrency">Concurrency (1–3)</Label>
            <Input id="send-concurrency" type="number" min={1} max={3} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Math.min(3, Number(event.target.value))))} />
          </div>
          <div>
            <Label htmlFor="send-delay">Delay between sends (milliseconds)</Label>
            <Input id="send-delay" type="number" min={0} max={60000} step={100} value={delay} onChange={(event) => setDelay(Number(event.target.value))} />
          </div>
          <div>
            <Label htmlFor="default-duplicate-policy">Default duplicate policy</Label>
            <Select id="default-duplicate-policy" value={duplicate} onChange={(event) => setDuplicate(event.target.value as typeof duplicate)}>
              <option value="block_template_recipient">Block same template + recipient</option>
              <option value="warn">Warn but allow duplicates</option>
              <option value="allow">Allow duplicates (useful for testing)</option>
            </Select>
            <p className="mt-2 text-xs leading-5 text-[#68736f]">This becomes the default on each dataset&apos;s Send page, where you can change it for that send. Allow lets multiple company rows use the same test inbox.</p>
          </div>
          <div>
            <Label htmlFor="default-subject-strategy">Default subject strategy</Label>
            <Select id="default-subject-strategy" value={subject} onChange={(event) => setSubject(event.target.value as typeof subject)}>
              <option value="spreadsheet_fallback">Spreadsheet subject with template fallback</option>
              <option value="template">Template subject</option>
              <option value="spreadsheet">Spreadsheet subject only</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="default-test-recipient">Default test recipient</Label>
            <Input id="default-test-recipient" type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="test@example.com" />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
            <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
            Keep original imported files by default
          </label>
        </div>
        <div className="flex justify-end"><Button onClick={save}><Save size={15} />Save preferences</Button></div>
      </CardContent>
    </Card>
  );
}
