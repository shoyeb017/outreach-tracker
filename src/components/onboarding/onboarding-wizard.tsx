"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, LoaderCircle, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { connectMicrosoft } from "@/lib/microsoft/msal";

const steps = ["Account", "Microsoft Entra", "Connect Microsoft", "First import"];

export function OnboardingWizard({ email, fullName }: { email: string; fullName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [profile, setProfile] = useState({ fullName, email });
  const [microsoft, setMicrosoft] = useState({ tenantId: "", clientId: "", expectedEmail: email, connectedEmail: "" });

  async function userId() {
    const { data: { user } } = await getSupabaseBrowserClient().auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in again.");
    return user.id;
  }

  async function next() {
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const id = await userId();
      if (step === 0) {
        const { error } = await supabase.from("profiles").upsert({ id, full_name: profile.fullName.trim(), email: profile.email.trim() || null });
        if (error) throw error;
      }
      if (step === 1 && microsoft.tenantId && microsoft.clientId) {
        const { error } = await supabase.from("microsoft_integrations").upsert({ user_id: id, tenant_id: microsoft.tenantId, client_id: microsoft.clientId, expected_email: microsoft.expectedEmail || null }, { onConflict: "user_id" });
        if (error) throw error;
      }
      setStep((value) => Math.min(value + 1, 3));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this step.");
    } finally {
      setPending(false);
    }
  }

  async function connect() {
    if (!microsoft.tenantId || !microsoft.clientId) return toast.error("Enter your Tenant ID and Client ID in the previous step.");
    setPending(true);
    try {
      const account = await connectMicrosoft(microsoft.tenantId, microsoft.clientId);
      if (microsoft.expectedEmail && account.username.toLowerCase() !== microsoft.expectedEmail.toLowerCase()) throw new Error("The selected Microsoft account does not match the expected email.");
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("microsoft_integrations").update({ connected_email: account.username, connection_status: "connected", last_connected_at: new Date().toISOString() }).eq("user_id", await userId());
      if (error) throw error;
      setMicrosoft((current) => ({ ...current, connectedEmail: account.username }));
      toast.success("Microsoft account connected. This is the From address recipients will see.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setPending(false);
    }
  }

  async function finish(destination = "/dashboard") {
    setPending(true);
    try {
      const { error } = await getSupabaseBrowserClient().from("profiles").update({ onboarding_completed: true }).eq("id", await userId());
      if (error) throw error;
      router.push(destination);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finish onboarding.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-7 flex items-center">{steps.map((label, index) => <div className="flex flex-1 items-center" key={label}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${index < step ? "bg-[#176b55] text-white" : index === step ? "border-2 border-[#176b55] bg-white text-[#176b55]" : "bg-[#e9edeb] text-[#7a8581]"}`}>{index < step ? <Check size={14} /> : index + 1}</span>{index < steps.length - 1 && <span className="mx-2 h-px flex-1 bg-[#dfe5e2]" />}</div>)}</div>
      <Card>
        <CardContent className="min-h-[440px] p-7 md:p-10">
          {step === 0 && <Step title="Your account" copy="This identifies your private workspace. It is not used as the email sender."><div className="grid gap-4 md:grid-cols-2"><Field label="Full name" value={profile.fullName} onChange={(value) => setProfile((current) => ({ ...current, fullName: value }))} /><Field label="Account email" value={profile.email} type="email" onChange={(value) => setProfile((current) => ({ ...current, email: value }))} /></div></Step>}
          {step === 1 && <Step title="Configure your Entra SPA" copy="The connected Microsoft 365 mailbox becomes the actual From address. No separate sender profile is needed."><div className="space-y-4"><Field label="Tenant ID" value={microsoft.tenantId} onChange={(value) => setMicrosoft((current) => ({ ...current, tenantId: value }))} /><Field label="Application / Client ID" value={microsoft.clientId} onChange={(value) => setMicrosoft((current) => ({ ...current, clientId: value }))} /><Field label="Expected Microsoft email" type="email" value={microsoft.expectedEmail} onChange={(value) => setMicrosoft((current) => ({ ...current, expectedEmail: value }))} /><div className="rounded-lg bg-[#f3f7f5] p-4 text-xs leading-5 text-[#596561]">Configure this application URL as an SPA redirect URI and grant delegated User.Read and Mail.Send. Never enter a client secret or Microsoft password.</div></div></Step>}
          {step === 2 && <Step title="Connect Microsoft 365" copy="This account supplies the From address. Your optional signature is built later from fully reorderable lines in Settings."><div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f3ee] text-[#176b55]"><PlugZap /></span>{microsoft.connectedEmail ? <><h3 className="mt-4 font-semibold">Connected</h3><p className="mt-1 text-sm text-[#68736f]">{microsoft.connectedEmail}</p></> : <><h3 className="mt-4 font-semibold">Ready to connect</h3><p className="mt-1 text-sm text-[#68736f]">A Microsoft popup will request only the delegated permissions you configured.</p><Button className="mt-4" onClick={connect} disabled={pending}>Connect Microsoft account</Button></>}</div></div></Step>}
          {step === 3 && <Step title="Bring in your first spreadsheet" copy="This step is optional. You can build your dynamic signature at any time from Settings."><div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-center"><div><FileSpreadsheet className="mx-auto text-[#176b55]" size={30} /><h3 className="mt-4 font-semibold">Preview before anything is saved</h3><p className="mt-1 max-w-md text-sm leading-6 text-[#68736f]">Choose a worksheet, inspect the data, map headers, configure routing, then approve the import.</p><Button className="mt-4" onClick={() => finish("/datasets/import")}>Import spreadsheet</Button></div></div></Step>}
        </CardContent>
      </Card>
      <div className="mt-5 flex items-center justify-between"><Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || pending}><ArrowLeft size={15} />Back</Button><div className="text-xs font-medium text-[#7a8581]">{steps[step]}</div>{step < 3 ? <Button onClick={next} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : null}{step >= 1 ? "Skip or continue" : "Save and continue"}<ArrowRight size={15} /></Button> : <Button onClick={() => finish()} disabled={pending}>Skip and open dashboard</Button>}</div>
    </div>
  );
}

function Step({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return <div><div className="eyebrow">Step setup</div><h1 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{title}</h1><p className="mb-7 mt-2 text-sm leading-6 text-[#68736f]">{copy}</p>{children}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div><Label>{label}</Label><Input required={label === "Full name"} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
