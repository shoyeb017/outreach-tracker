"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfigurationFields } from "@/components/microsoft/configuration-fields";
import { resolveAuthority, type MicrosoftConfiguration } from "@/lib/microsoft/authority";
export function MicrosoftDefaultForm({ initial }: { initial: MicrosoftConfiguration | null }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [configuration, setConfiguration] = useState(initial);
  async function submit(body: Record<string, unknown>) {
    if (pending) return; setPending(true); setMessage("");
    try { const response = await fetch("/api/admin/microsoft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); if (result.configuration) setConfiguration(result.configuration); setMessage(body.action === "validate" ? (result.configuration.detected_audience ? "Account types verified from Microsoft Graph." : "Optional metadata detection is unavailable. Users can still connect with automatic sign-in.") : "Settings saved. Users can now choose Administrator setup and connect their Microsoft account. Existing default senders must reconnect."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save settings."); } finally { setPending(false); }
  }
  const audience = configuration?.detected_audience ?? configuration?.fallback_audience;
  return <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
    <form className="min-w-0 space-y-8" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (initial && !window.confirm("Save these default settings? Existing default senders will need to reconnect. Current settings will be replaced, and the change will be audited.")) return; void submit({ name: String(form.get("name") || "Application default"), client_id: form.get("client_id"), tenant_id: form.get("tenant_id"), fallback_audience: form.get("fallback_audience") || null, enabled: form.has("enabled"), allow_custom: form.has("allow_custom") }); }}>
      <fieldset disabled={pending} className="space-y-8">
        <section className="surface-card border bg-[var(--card)] p-6 sm:p-8"><h2 className="text-lg font-semibold">1. Your Microsoft app</h2><p className="mb-6 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Copy the two public IDs from your Entra app registration. No client secret is needed.</p><ConfigurationFields initial={initial} fallbackVisible={!configuration?.detected_audience} /></section>
        <section className="surface-card border bg-[var(--card)] p-6 sm:p-8"><h2 className="mb-5 text-lg font-semibold">2. What users can choose</h2><div className="space-y-5">
          <div><Label className="flex items-start gap-3"><input className="mt-1" name="enabled" type="checkbox" defaultChecked={initial?.enabled ?? true} />Enable default Microsoft connection</Label><p className="ml-7 mt-2 text-sm text-[var(--muted-foreground)]">Users can connect their mailbox using these app IDs.</p></div>
          <div className="border-t pt-5"><Label className="flex items-start gap-3"><input className="mt-1" name="allow_custom" type="checkbox" defaultChecked={initial?.allow_custom ?? true} />Allow users to save their own app registrations</Label><p className="ml-7 mt-2 text-sm text-[var(--muted-foreground)]">Users can choose their own configuration instead of the default.</p></div>
        </div></section>
        <div className="border-t pt-6"><p className="mb-4 text-sm text-[var(--muted-foreground)]">Changing a saved default requires existing default senders to reconnect.</p><Button type="submit">{pending ? "Working…" : "Save Settings"}</Button></div>
      </fieldset>
      {message && <p role="status" className="border-l-2 pl-4 text-sm leading-7">{message}</p>}
    </form>
    <aside className="min-w-0 space-y-6">
      <section className="surface-card border p-6"><h2 className="text-lg font-semibold">What happens next?</h2><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-[var(--muted-foreground)]"><li>Save the app IDs.</li><li>Users open Settings → Email account and select Administrator setup.</li><li>Each user connects their own Microsoft mailbox and tests it.</li></ol><p className="mt-4 border-t pt-4 text-sm leading-6">These IDs are shared. The administrator’s mailbox is not.</p></section>
      <details className="rounded-3xl border bg-[var(--card)] p-6"><summary className="cursor-pointer font-semibold">Configuration diagnostics</summary><div className="mt-4 space-y-4 text-sm leading-6">
        <p>Detection: {configuration?.detected_audience ? "Verified" : configuration?.fallback_audience ? "Manual fallback" : "Automatic sign-in · metadata not verified"}</p>
        <p className="break-words">Audience: {audience ?? "Not determined"}</p>
        <p className="break-all">Authority: {audience && configuration ? resolveAuthority(configuration.tenant_id, audience) : "https://login.microsoftonline.com/common (automatic sign-in)"}</p>
        <p>Last validation attempt: {configuration?.validated_at ?? "Not checked"}</p><p>Last successful verification: {configuration?.verified_at ?? "Not verified"}</p>
        <p className="text-[var(--muted-foreground)]">Mail.Send consent is checked when users connect. Metadata detection does not prove permission consent or delivery.</p>
        {configuration?.validation_error && <p>{configuration.validation_error}</p>}
        <Button variant="outline" disabled={!initial || pending} onClick={() => void submit({ action: "validate" })}>Refresh configuration</Button>
      </div></details>
    </aside>
  </div>;
}
