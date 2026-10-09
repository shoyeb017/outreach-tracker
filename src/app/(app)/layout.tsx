import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let microsoftConnected = false; let microsoftEmail: string | null = null; let liveEnabled = false; let microsoftClientIds: string[] = [];
  if (supabase && user) {
    const [integration, preferences, configurations] = await Promise.all([
      supabase.from("microsoft_integrations").select("connection_status,client_id,connected_email,home_account_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_preferences").select("live_sending_enabled").eq("user_id", user.id).maybeSingle(),
      supabase.from("microsoft_user_configurations").select("client_id").eq("user_id", user.id),
    ]);
    microsoftConnected = integration.data?.connection_status === "connected" && Boolean(integration.data?.home_account_id && integration.data?.connected_email);
    microsoftEmail = microsoftConnected ? integration.data?.connected_email ?? null : null;
    liveEnabled = preferences.data?.live_sending_enabled ?? false;
    microsoftClientIds = [...(configurations.data ?? []).map((entry) => entry.client_id), ...(integration.data?.client_id ? [integration.data.client_id] : [])];
  }
  return <><a className="skip-link" href="#workspace-content">Skip to content</a><div className="app-grid"><Sidebar liveEnabled={liveEnabled} /><div className="min-w-0"><AppHeader email={user?.email} microsoftConnected={microsoftConnected} microsoftEmail={microsoftEmail} liveEnabled={liveEnabled} microsoftClientIds={microsoftClientIds} />{isUiTestMode() && <div data-ui-test="workspace" className="border-b border-[var(--border)] bg-[var(--muted)] px-6 py-2 text-left text-xs text-[var(--muted-foreground)]">UI test workspace — authentication, persistence, and real sending are disabled.</div>}<div id="workspace-content" tabIndex={-1}>{children}</div></div></div></>;
}
