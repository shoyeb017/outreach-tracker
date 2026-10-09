"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfigurationFields } from "./configuration-fields";
import { acquireGraphToken, connectMicrosoft, disconnectMicrosoft, selectedConfiguration } from "@/lib/microsoft/msal";
import { humanMicrosoftError, type MicrosoftConfiguration, type ResolvedMicrosoftConfiguration } from "@/lib/microsoft/authority";
import type { MicrosoftIntegration } from "@/types";
import { TestEmail } from "./test-email";

export function MicrosoftSettings({ integration, defaults = null, configurations = [], setupError = "" }: {
  integration?: Partial<MicrosoftIntegration> | null; defaults?: MicrosoftConfiguration | null; configurations?: MicrosoftConfiguration[]; setupError?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(integration);
  const [own, setOwn] = useState(configurations);
  const [resolved, setResolved] = useState<ResolvedMicrosoftConfiguration | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [view, setView] = useState<"default" | "custom">(integration?.configuration_id ? integration.connection_method ?? "custom" : "default");
  const [mailBusy, setMailBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [testResult, setTestResult] = useState("");
  const lock = useRef(false);
  const setupForm = useRef<HTMLFormElement>(null);
  const busy = Boolean(pending) || mailBusy;
  const [dirty, setDirty] = useState(false);
  const custom = own.find((entry) => entry.id === current?.configuration_id);
  const method = current?.configuration_id ? current.connection_method ?? "custom" : "default";
  const selected = view === "default" ? defaults : custom;
  const ready = Boolean(selected && (view === "custom" || defaults?.enabled) && !setupError);
  const selectionMatches = view === method && selected?.id === current?.configuration_id;
  const connected = current?.connection_status === "connected" && Boolean(current?.home_account_id && current?.connected_email);
  const allowCustom = defaults?.allow_custom !== false;
  const legacy = method === "custom" ? { client_id: current?.client_id, tenant_id: current?.tenant_id } : {};
  function remember(configuration: ResolvedMicrosoftConfiguration) {
    setResolved(configuration);
    if (configuration.method === "custom") setOwn((values) => values.map((value) => value.id === configuration.id ? configuration : value));
  }
  async function api(body: Record<string, unknown>) {
    const response = await fetch("/api/microsoft/configuration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not update your Microsoft configuration.");
    return result;
  }
  async function action(name: string, work: () => Promise<void>) {
    if (lock.current || mailBusy) return; lock.current = true; setPending(name); setMessage(""); setFailed(false);
    try { await work(); } catch (error) { setFailed(true); setMessage(humanMicrosoftError(error)); } finally { lock.current = false; setPending(""); router.refresh(); }
  }
  async function choose(nextMethod: "default" | "custom", id?: string) {
    if ((connected || dirty) && !window.confirm("Change configuration? Your current sender will disconnect. Unsaved setup edits will be discarded.")) return;
    await action("select", async () => {
      const result = await api({ action: "select", method: nextMethod, id });
      const configuration = result.configuration as ResolvedMicrosoftConfiguration;
      setView(nextMethod); setTestResult(""); remember(configuration); setCurrent({ ...current, tenant_id: configuration.tenant_id, client_id: configuration.client_id, configuration_id: configuration.id, connection_method: nextMethod, connection_status: "not_connected", connected_email: null, home_account_id: null, display_name: null, resolved_authority: null, last_verified_at: null, last_connected_at: null }); setDirty(false);
      setMessage("Configuration selected. Connect the Microsoft account you want to send from.");
    });
  }
  async function connect() {
    if (!ready || dirty) return;
    if (connected && !window.confirm("Switch sender? The saved account will disconnect before Microsoft sign-in. Select the intended account in Microsoft’s window.")) return;
    setTestResult("");
    await action("connect", async () => {
      const selectedResult = await api({ action: "select", method: view, ...(view === "custom" ? { id: selected?.id } : {}) });
      const configuration = selectedResult.configuration as ResolvedMicrosoftConfiguration;
      remember(configuration);
      setCurrent((value) => ({ ...value, configuration_id: configuration.id, connection_method: configuration.method, client_id: configuration.client_id, tenant_id: configuration.tenant_id, connection_status: "not_connected", connected_email: null, home_account_id: null, display_name: null, resolved_authority: null, last_verified_at: null, last_connected_at: null }));
      const account = await connectMicrosoft(configuration.tenant_id, configuration.client_id);
      const saved = await selectedConfiguration(configuration.tenant_id, configuration.client_id);
      remember(saved);
      setCurrent((value) => ({ ...value, tenant_id: configuration.tenant_id, client_id: configuration.client_id, connection_method: configuration.method, configuration_id: configuration.id, home_account_id: account.homeAccountId, connected_email: saved.connected_email, display_name: saved.display_name, last_verified_at: saved.last_verified_at, account_type: account.tenantId === "9188040d-6c67-4c5b-b112-36a304b66dad" ? "personal" : "organization", resolved_authority: saved.authority, connection_status: "connected", last_connected_at: new Date().toISOString() }));
      setMessage("Microsoft account connected. No email was sent. Use the tests below to check this sender.");
    });
  }
  async function test() {
    setTestResult("");
    await action("test", async () => {
      const { token, account, grantedScopes } = await acquireGraphToken(current?.tenant_id ?? "", current?.client_id ?? "", false);
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Microsoft Graph access failed. Reconnect or ask your administrator to check User.Read and mailbox availability.");
      const profile = await response.json();
      const mailbox = profile.mail || profile.userPrincipalName;
      if (mailbox?.toLowerCase() !== current?.connected_email?.toLowerCase()) throw new Error("This browser session differs from the saved sender. Reconnect the intended account.");
      const verification = await api({ action: "verify", accessToken: token, homeAccountId: account.homeAccountId, authority: current?.resolved_authority, configurationId: current?.configuration_id, clientId: current?.client_id });
      setCurrent((value) => ({ ...value, last_verified_at: verification.verified_at }));
      const sendConsent = grantedScopes?.some((scope) => /(?:^|\/)Mail\.Send$/i.test(scope));
      setTestResult(`Authentication and User.Read verified. ${sendConsent ? "This token reports Mail.Send consent." : "Mail.Send consent is not verified by this profile token; reconnect to request it."} Neither this test nor consent proves mailbox send policy or delivery. No email was sent.`);
    });
  }
const audience = resolved?.id === selected?.id ? resolved?.audience : selected?.detected_audience ?? selected?.fallback_audience;
  async function validateSelected() {
    await action("validate", async () => {
      const result = await api({ action: "validate", method: view, ...(view === "custom" ? { id: selected?.id } : {}) });
      remember(result.configuration);
      if (result.configuration.id === current?.configuration_id && connected && !result.configuration.home_account_id) {
        setCurrent((value) => ({ ...value, connection_status: "not_connected", connected_email: null, home_account_id: null, last_verified_at: null }));
        setTestResult("");
      }
      setMessage(result.configuration.verification === "verified" ? "Supported account types verified. Reconnect if the configuration changed." : result.configuration.verification === "manual" ? "Using the saved account-type override. You can connect now." : "Automatic sign-in is ready. Optional metadata detection is unavailable; you can still connect.");
    });
  }
  return <div id="microsoft" className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><h2 className="text-xl font-semibold tracking-tight">Connect and test your email account</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Use the administrator’s setup, connect your Microsoft mailbox, then test it. Your workspace login is separate from your sending account.</p></div>
      <Link className="focus-ring text-sm font-semibold text-[var(--primary)]" href="/help/default-connection">Setup help</Link>
    </div>
    {setupError && <p role="alert" className="rounded-xl border bg-[var(--warning-soft)] p-4 text-sm">{setupError}</p>}
    <Card><CardHeader><p className="eyebrow mb-2">Step 1 · Connection setup</p><CardTitle>Choose your connection setup</CardTitle><p className="mt-2 text-sm text-[var(--muted-foreground)]">Selected by default for new users. No Client ID or Tenant ID is needed from you.</p></CardHeader><CardContent className="space-y-5">
      <div role="group" aria-label="Microsoft connection setup" className="flex flex-col gap-2 rounded-xl bg-[var(--surface-hover)] p-2 sm:flex-row">
        <Button className="flex-1" variant={view === "default" ? "default" : "ghost"} aria-pressed={view === "default"} disabled={busy} onClick={() => { if (dirty && !window.confirm("Leave this setup? Unsaved edits will be discarded.")) return; if (dirty) setupForm.current?.reset(); setView("default"); setShowSetup(false); setDirty(false); setMessage(""); setFailed(false); }}>Administrator setup (recommended)</Button>
        {allowCustom && <Button className="flex-1" variant={view === "custom" ? "default" : "ghost"} aria-pressed={view === "custom"} disabled={busy} onClick={() => { setView("custom"); setShowSetup(!custom); setMessage(""); setFailed(false); }}>My own app registration</Button>}
      </div>
      {view === "default" ? <div className="space-y-4 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{defaults?.name ?? "Administrator configuration"}</h3><Badge tone={defaults?.enabled ? "success" : "neutral"}>{defaults?.enabled ? "Available" : "Unavailable"}</Badge></div>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">You use the administrator’s Entra app—not their mailbox. Click Connect account below and select your own Microsoft account.</p>
        {!defaults?.enabled && <p className="text-sm">Ask the application administrator to save and enable the default configuration. You do not need to create an app yourself.</p>}
        {method === "custom" && current?.configuration_id && <Button variant="outline" disabled={busy || !defaults?.enabled} onClick={() => void choose("default")}>Use default configuration</Button>}
      </div> : <div className="space-y-4">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">Optional advanced setup. Use this only if you manage your own Microsoft Entra app. Selecting or saving a registration disconnects the current sender; reconnect and test afterward.</p>
        {own.length > 0 && <div><Label htmlFor="saved-ms-config">Your saved configurations</Label><Select id="saved-ms-config" value={method === "custom" ? current?.configuration_id ?? "" : ""} disabled={busy} onChange={(event) => { if (event.target.value) void choose("custom", event.target.value); }}><option value="">Choose a saved configuration</option>{own.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select></div>}
        <Button variant="outline" aria-expanded={showSetup} aria-controls="mailbox-setup" disabled={busy} onClick={() => setShowSetup((value) => !value)}>{showSetup ? "Hide setup" : "Edit connection setup"}</Button>
      </div>}
      {!allowCustom && <p className="text-sm text-[var(--muted-foreground)]">Personal app registrations are disabled by your administrator.</p>}
      {dirty && <p role="status" className="text-sm text-[var(--muted-foreground)]">Save your setup edits before connecting or validating.</p>}
    </CardContent></Card>
    {allowCustom && <Card id="mailbox-setup" hidden={view !== "custom" || !showSetup}><CardHeader><CardTitle>Your app registration</CardTitle><p className="mt-2 text-sm text-[var(--muted-foreground)]">IDs are public identifiers. Never enter an Azure client secret here.</p></CardHeader><CardContent><form ref={setupForm} key={current?.configuration_id ?? "new"} className="space-y-6" onChange={() => setDirty(true)} onSubmit={(event) => { event.preventDefault(); const form=new FormData(event.currentTarget); if (connected && !window.confirm("Saving configuration resets your connection status. Continue?")) return; void action("save",async()=>{ const result=await api({action:"save",name:form.get("name") || "My configuration",client_id:form.get("client_id"),tenant_id:form.get("tenant_id"),fallback_audience:form.get("fallback_audience")||null}); const configuration=result.configuration as MicrosoftConfiguration; setOwn((values)=>[...values.filter((value)=>value.id!==configuration.id),configuration]); setCurrent((value)=>({...value,client_id:configuration.client_id,tenant_id:configuration.tenant_id,configuration_id:configuration.id,connection_method:"custom",connection_status:"not_connected",connected_email:null,home_account_id:null,display_name:null,resolved_authority:null,last_verified_at:null,last_connected_at:null})); setView("custom"); setTestResult(""); setDirty(false); setResolved(null); setMessage("Configuration saved. Connect your Microsoft account below, then run a test."); }); }}><fieldset disabled={busy} className="space-y-6"><ConfigurationFields initial={custom ?? legacy} fallbackVisible={!(custom?.detected_audience || (resolved?.id === custom?.id && resolved?.verification === "verified"))} /><div className="flex flex-wrap gap-3"><Button type="submit">Save Configuration</Button><Button variant="outline" disabled={dirty || !current?.client_id} onClick={()=>void action("validate",async()=>{ const result=await api({action:"validate"});remember(result.configuration);setMessage(result.configuration.validation_error || "Configuration verified.");})}>Validate Configuration</Button>{custom && <Button variant="danger" onClick={()=>{if(window.confirm("Remove this saved configuration? Its active sender will disconnect. Outreach history is retained."))void action("remove",async()=>{await api({action:"remove",id:custom.id});setOwn((values)=>values.filter((value)=>value.id!==custom.id));setCurrent(null);setView("default");setShowSetup(false);setTestResult("");setResolved(null);setDirty(false);setMessage("Configuration removed. Outreach data was retained.");});}}>Remove Configuration</Button>}</div></fieldset><p className="text-xs text-[var(--muted-foreground)]">Saving configuration resets your connection status. Validate the saved IDs and reconnect afterward.</p></form></CardContent></Card>}
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow mb-2">Step 2 · Sending account</p><CardTitle>Connect your Microsoft mailbox</CardTitle></div><Badge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Not connected"}</Badge></div></CardHeader><CardContent className="space-y-5">
      <div className="rounded-xl bg-[var(--surface-hover)] p-4 sm:p-5"><p className="text-xs font-semibold normal-case tracking-normal text-[var(--muted-foreground)]">Currently connected sender</p><p className="mt-2 break-words text-lg font-semibold">{connected ? current?.connected_email : "No Microsoft mailbox connected"}</p>{connected && current?.display_name && <p className="mt-1 text-sm">{current.display_name}</p>}<p className="mt-3 text-sm text-[var(--muted-foreground)]">{current?.configuration_id ? `Active setup: ${method === "default" ? "Administrator" : "My own"} · ${method === "default" ? defaults?.name ?? "Saved registration" : custom?.name ?? "Saved registration"}` : "Administrator setup will be selected when you connect."}</p></div>
      {connected && !selectionMatches && <p className="rounded-xl border p-4 text-sm">You are viewing a different setup. The connected sender still uses {method === "default" ? "the administrator’s setup" : "your own registration"}. Connecting with the setup above disconnects this sender first.</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Button onClick={() => void connect()} disabled={busy || dirty || !ready}>{pending === "connect" ? "Connecting…" : connected ? "Reconnect / switch account" : "Connect account"}</Button>{connected && <Button variant="outline" disabled={busy} onClick={() => void action("disconnect", async () => { await disconnectMicrosoft(current?.tenant_id ?? "", current?.client_id ?? "").catch(() => undefined); await api({ action: "disconnect" }); setCurrent((value) => ({ ...value, connection_status: "not_connected", connected_email: null, home_account_id: null, display_name: null, resolved_authority: null, last_verified_at: null, last_connected_at: null })); setTestResult(""); setMessage("Sender disconnected. Other Microsoft browser sessions were not signed out."); })}>Disconnect</Button>}</div>
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">To test another account, use “Reconnect / switch account” and choose it in Microsoft’s window. One sender is active at a time. Cancelling sign-in leaves the sender disconnected.</p>
      <details className="rounded-xl border p-4 text-sm leading-6"><summary className="cursor-pointer font-semibold">Can I connect a Gmail account?</summary><p className="mt-3">This app sends through Microsoft, not Google. A Gmail address may identify a Microsoft account, but signing in does not connect its Gmail mailbox. Sending requires a supported Microsoft 365 or Outlook.com mailbox and a registration that permits your account type. You can send a test message to a Gmail inbox below.</p></details>
    </CardContent></Card>
    <div aria-live="polite" aria-atomic="true">{(message || pending) && <p role={failed ? "alert" : "status"} className={`rounded-xl border p-4 text-sm leading-6 ${failed ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "bg-[var(--surface-hover)]"}`}>{message || "Working…"}</p>}</div>
    <section aria-labelledby="email-testing-heading" className="space-y-4">
      <div><p className="eyebrow mb-2">Step 3 · Test before sending</p><h2 id="email-testing-heading" className="text-lg font-semibold">Check the account you connected</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Both tests use the sender shown above. To test administrator and personal setups, connect and test one, switch to the other, then repeat.</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Check connection · no email sent</CardTitle><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Verifies Microsoft sign-in and profile access. It does not prove that sending is allowed.</p></CardHeader><CardContent className="space-y-5"><p className="break-words text-sm"><span className="font-semibold">Account:</span> {connected ? current?.connected_email : "Connect a sender first"}</p><Button variant="outline" onClick={() => void test()} disabled={busy || dirty || !connected || !selectionMatches}>{pending === "test" ? "Checking…" : "Test connection"}</Button>{testResult && <p role="status" className="rounded-xl border p-4 text-sm leading-6">{testResult}</p>}<p className="text-xs text-[var(--muted-foreground)]">Last mailbox verification: <span className="break-words">{current?.last_verified_at ? `${new Date(current.last_verified_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not yet verified"}</span></p></CardContent></Card>
        <TestEmail integration={current} disabled={busy || dirty || !connected || !selectionMatches} onBusyChange={setMailBusy} />
      </div>
      {connected && !selectionMatches && <p className="text-sm text-[var(--muted-foreground)]">Return to the active setup, or connect the setup you are viewing, to enable its tests.</p>}
    </section>
    <details className="rounded-xl border bg-[var(--card)] p-4 sm:p-6"><summary className="cursor-pointer text-sm font-semibold">Advanced · configuration diagnostics</summary><div className="mt-5 space-y-5"><p className="text-sm text-[var(--muted-foreground)]">Details for the setup selected in Step 1. These are not delivery results.</p><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-[var(--muted-foreground)]">Selected registration</dt><dd>{selected?.name ?? "None"}</dd></div><div><dt className="text-[var(--muted-foreground)]">Supported account types</dt><dd>{audience ?? "Not determined"}</dd></div><div><dt className="text-[var(--muted-foreground)]">Detection</dt><dd>{resolved?.id === selected?.id ? resolved?.verification : selected?.detected_audience ? "Previously verified—refresh to check" : audience ? "Manual fallback" : "Unverified"}</dd></div><div><dt className="text-[var(--muted-foreground)]">Authority</dt><dd className="break-all">{resolved?.id === selected?.id ? resolved?.authority : selectionMatches ? current?.resolved_authority ?? "Determined when connecting" : "Determined when connecting"}</dd></div></dl>{selected?.validation_error && <p className="text-sm">{selected.validation_error}</p>}<Button variant="outline" disabled={busy || dirty || !ready} onClick={() => void validateSelected()}>Refresh configuration</Button><Link href="/help/troubleshooting" className="focus-ring block text-sm font-semibold text-[var(--primary)]">Troubleshooting guide</Link></div></details>
  </div>;
}
