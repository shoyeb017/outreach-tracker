import { PageHeader } from "@/components/layout/page-header";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SignatureBuilder } from "@/components/signature/signature-builder";
import { MicrosoftSettings } from "@/components/microsoft/microsoft-settings";
import { SendingSettings } from "@/components/settings/sending-settings";
import { DataPrivacySettings } from "@/components/settings/data-privacy-settings";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const [profile, sender, fields, integration, preferences, suppressions] = supabase ? await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(), supabase.from("sender_profiles").select("*").maybeSingle(), supabase.from("signature_fields").select("*").order("display_order"),
    supabase.from("microsoft_integrations").select("*").maybeSingle(), supabase.from("user_preferences").select("*").maybeSingle(), supabase.from("suppression_list").select("id,email,reason,notes,created_at").order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: {} }, { data: {} }, { data: [] }, { data: null }, { data: {} }, { data: [] }];
  return <main className="page-shell"><PageHeader eyebrow="Workspace" title="Settings" description="Manage your identity, reusable signature, Microsoft connection, sending controls, and privacy preferences." /><div className="grid gap-7 xl:grid-cols-[190px_minmax(0,1fr)]"><nav className="hidden xl:block"><div className="sticky top-24 space-y-1 text-sm">{[["#account", "Account"], ["#sender", "Sender profile"], ["#signature", "Signature builder"], ["#microsoft", "Microsoft 365"], ["#sending", "Sending"], ["#privacy", "Data & privacy"]].map(([href, label]) => <a key={href} className="block rounded-lg px-3 py-2 text-[#596561] hover:bg-white hover:text-[#176b55]" href={href}>{label}</a>)}</div></nav><div className="space-y-7"><ProfileSettings profile={profile.data ?? {}} sender={sender.data ?? {}} /><SignatureBuilder sender={sender.data ?? {}} initialFields={fields.data ?? []} /><MicrosoftSettings integration={integration.data} /><SendingSettings preferences={preferences.data ?? {}} /><DataPrivacySettings initialSuppressions={suppressions.data ?? []} /></div></div></main>;
}
