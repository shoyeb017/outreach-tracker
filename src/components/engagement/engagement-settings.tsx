"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { defaultEngagement, engagementButton, engagementSettings, safeEngagementPreview, validDestination, type EngagementSettings as Settings } from "@/lib/engagement/core";
import { engagementRequest } from "@/lib/engagement/client";
import { renderSignature } from "@/lib/email/signature";
import { sendGraphEmail, verifyMicrosoftSender } from "@/lib/microsoft/graph";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UncertainSendError } from "@/lib/sending/errors";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email";
import type { MicrosoftIntegration, SignatureField } from "@/types";

export function EngagementSettings({ fields = [], integration }: { fields?: SignatureField[]; integration?: Partial<MicrosoftIntegration> | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Settings>(defaultEngagement), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [testEmail, setTestEmail] = useState(""), [uncertain, setUncertain] = useState(false);
  useEffect(() => { const controller = new AbortController(); engagementRequest<{ settings: Settings }>("/api/engagement/settings", { signal: controller.signal }).then(data => setDraft(data.settings)).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) { setDraft(current => ({ ...current, [key]: value })); setNotice(""); }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await engagementRequest<{ settings: Settings }>("/api/engagement/settings", { method: "PUT", body: JSON.stringify(draft) }); setDraft(result.settings); setNotice("Saved. New campaign reviews use these defaults. Existing scheduled emails keep their reviewed settings."); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save settings."); } finally { setBusy(false); }
  }
  const normalized = engagementSettings(draft);
  const signature = renderSignature(fields);
  function example(test = false) {
    const button = engagementButton(normalized, test ? normalized.destination : undefined);
    const message = "<p>Hi Sample Company,</p><p>This is an example of your personalized email message.</p>";
    return message + (draft.placement === "before_signature" ? button + signature : signature + button);
  }
  async function test() {
    if (!isValidEmail(testEmail)) return setError("Enter a valid test recipient email.");
    if (!normalized.enabled || !validDestination(draft.destination)) return setError("Enable the button and enter a public HTTPS website first.");
    if (!integration?.connected_email || integration.connection_status !== "connected") return setError("Connect Microsoft in Email account before sending a real test.");
    if (!window.confirm(`Send one real engagement-button test to ${testEmail} from ${integration.connected_email}? This does not create engagement statistics.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: protectionError } = await getSupabaseBrowserClient().rpc("send_recipient_protection", { p_emails: [normalizeEmail(testEmail)] });
      if (protectionError || !data) throw new Error("Recipient safety checks are unavailable. No test was sent.");
      if ((data.suppressed ?? []).includes(normalizeEmail(testEmail))) throw new Error("This address is on your do-not-email list.");
      const expected = await verifyMicrosoftSender(integration.tenant_id ?? "", integration.client_id ?? "", integration.connected_email);
      await sendGraphEmail({ tenantId: integration.tenant_id ?? "", clientId: integration.client_id ?? "", liveEnabled: true, expectedAccount: expected, email: { to: normalizeEmail(testEmail), subject: "[TEST] AUTMAIL engagement button", htmlBody: example(true) } });
      setNotice("Microsoft accepted the test email. Its button opens your website directly; no engagement activity is recorded.");
    } catch (failure) { if (failure instanceof UncertainSendError) setUncertain(true); setError(failure instanceof Error ? failure.message : "The test could not be sent."); } finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="flex items-center gap-2 p-6"><LoaderCircle size={16} className="animate-spin" />Loading engagement settings…</p>;
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Email engagement</CardTitle><p className="page-subtitle">Add one website button to spreadsheet emails and scheduled campaigns. Track link activity, not guaranteed reads. No template edits are needed.</p></CardHeader><CardContent className="space-y-5">
      {error && <p role="alert" className="rounded-md border p-4 text-sm text-[var(--danger)]">{error}</p>}{notice && <p role="status" className="rounded-md border p-4 text-sm text-[var(--primary)]">{notice}</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.enabled} disabled={busy} onChange={event => update("enabled", event.target.checked)} /><span><strong>Add the engagement button to new campaign reviews</strong><span className="mt-1 block text-xs leading-6 text-[var(--muted-foreground)]">You can turn it off for an individual send. Test and practice emails do not create tracking records. Manual Compose, replies and forwards are not modified.</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.collection_enabled} disabled={busy} onChange={event => update("collection_enabled", event.target.checked)} /><span><strong>Record activity from existing email links</strong><span className="mt-1 block text-xs leading-6 text-[var(--muted-foreground)]">Turn this off and save to pause recording. Existing links still redirect until they expire. Turning off the button above only affects new reviews.</span></span></label>
    </CardContent></Card>
    {draft.enabled && <div className="grid min-w-0 gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>Customize your button section</CardTitle></CardHeader><CardContent className="space-y-5">
      <div><Label htmlFor="engagement-url">Website to open</Label><Input id="engagement-url" type="url" maxLength={2048} placeholder="https://inuberry.com" value={draft.destination} disabled={busy} onChange={event => update("destination", event.target.value)} /><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">Use your public HTTPS website. Each recipient gets a private tracking link that redirects here.</p></div>
      <div><Label htmlFor="engagement-intro">Text before the button (optional)</Label><textarea id="engagement-intro" rows={3} maxLength={600} className="w-full rounded-md border bg-[var(--input)] p-3 text-sm" value={draft.intro} disabled={busy} onChange={event => update("intro", event.target.value)} /></div>
      <div><Label htmlFor="engagement-label">Button text</Label><Input id="engagement-label" maxLength={80} value={draft.button_text} disabled={busy} onChange={event => update("button_text", event.target.value)} /></div>
      <div className="grid gap-5 sm:grid-cols-2"><div><Label htmlFor="engagement-color">Button color</Label><Input id="engagement-color" type="color" value={draft.button_color} disabled={busy} onChange={event => update("button_color", event.target.value)} /></div><div><Label htmlFor="engagement-text-color">Button text color</Label><Input id="engagement-text-color" type="color" value={draft.text_color} disabled={busy} onChange={event => update("text_color", event.target.value)} /></div><div><Label htmlFor="engagement-align">Alignment</Label><Select id="engagement-align" disabled={busy} value={draft.alignment} onChange={event => update("alignment", event.target.value as Settings["alignment"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></Select></div><div><Label htmlFor="engagement-size">Button size</Label><Select id="engagement-size" disabled={busy} value={draft.size} onChange={event => update("size", event.target.value as Settings["size"])}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></Select></div></div>
      <div><Label htmlFor="engagement-placement">Where to add it</Label><Select id="engagement-placement" disabled={busy} value={draft.placement} onChange={event => update("placement", event.target.value as Settings["placement"])}><option value="before_signature">Before signature (recommended)</option><option value="after_signature">After signature</option></Select><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">If a template has no signature, the section goes at the end. Existing “Best regards” closing paragraphs stay with the signature.</p></div>
    </CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle>Preview</CardTitle></CardHeader><CardContent><div className="email-content rounded-md border bg-white p-5 text-sm text-[#172033]" onClick={event => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }} dangerouslySetInnerHTML={{ __html: safeEngagementPreview(example()) }} /><p className="mt-3 text-xs leading-6 text-[var(--muted-foreground)]">Preview links are inactive and never record activity. Choose readable, contrasting colors and test the appearance in your email client.</p></CardContent></Card><Card><CardHeader><CardTitle>Send a real test</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="engagement-test">Test recipient email</Label><Input id="engagement-test" type="email" value={testEmail} disabled={busy || uncertain} onChange={event => setTestEmail(event.target.value)} /><p className="text-xs leading-6 text-[var(--muted-foreground)]">Uses the customization shown above, even before saving. This sends one real email after confirmation, with a direct, untracked website link.</p>{uncertain && <p role="alert" className="text-sm text-[var(--danger)]">The outcome is uncertain. Check Microsoft Sent Items before trying again. No automatic retry is made.</p>}<Button variant="outline" disabled={busy || uncertain || !normalized.enabled} onClick={() => void test()}><Send size={15} />Send test email</Button></CardContent></Card></div></div>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-[var(--card)] p-4"><Link className="text-sm text-[var(--primary)] underline" href="/engagement">View email engagement</Link><Button disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}Save engagement settings</Button></div>
    <p className="text-xs leading-6 text-[var(--muted-foreground)]">Security scanners and forwarded messages can trigger links. Activity is not proof of reading or identity. Provide an appropriate privacy notice. Links and engagement snapshots expire after 90 days; deleting history or source data disables those links. <Link className="underline" href="/help/email-engagement">Read the engagement guide</Link>.</p>
  </div>;
}
