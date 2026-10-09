import { PageHeader } from "@/components/layout/page-header";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SignatureBuilder } from "@/components/signature/signature-builder";
import { MicrosoftSettings } from "@/components/microsoft/microsoft-settings";
import { SendingSettings } from "@/components/settings/sending-settings";
import { DataPrivacySettings } from "@/components/settings/data-privacy-settings";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { privilegedDatabase } from "@/lib/admin/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  let microsoftDefaults = null; let microsoftConfigurations = []; let microsoftSetupError = "";
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        const database = privilegedDatabase();
        const [defaults, owned] = await Promise.all([database.from("microsoft_default_configuration").select("*").maybeSingle(), database.from("microsoft_user_configurations").select("*").eq("user_id", user.id).order("name")]);
        if (defaults.error || owned.error) throw new Error("Microsoft setup needs the new database migration. Contact the application administrator.");
        microsoftDefaults = defaults.data; microsoftConfigurations = owned.data ?? [];
      } catch (error) { microsoftSetupError = error instanceof Error ? error.message : "Microsoft setup is unavailable."; }
    }
  }
  const [profile, fields, integration, preferences, suppressions] = supabase ? await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("signature_fields").select("*").order("display_order"),
    supabase.from("microsoft_integrations").select("*").maybeSingle(),
    supabase.from("user_preferences").select("*").maybeSingle(),
    supabase.from("suppression_list").select("id,email,reason,notes,created_at").order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: {} }, { data: [] }, { data: null }, { data: {} }, { data: [] }];

  return (
    <main className="page-shell">
      <PageHeader eyebrow="Workspace" title="Settings" description="Choose a section below to manage your email account, signature, and preferences." />
      <SettingsTabs panels={{
        microsoft: <MicrosoftSettings integration={integration.data} defaults={microsoftDefaults} configurations={microsoftConfigurations} setupError={microsoftSetupError} />,
        signature: <SignatureBuilder initialFields={fields.data ?? []} microsoftEmail={integration.data?.connected_email} />,
        sending: <SendingSettings preferences={preferences.data ?? {}} />,
        account: <ProfileSettings profile={profile.data ?? {}} />,
        privacy: <DataPrivacySettings initialSuppressions={suppressions.data ?? []} />,
      }} />
    </main>
  );
}
