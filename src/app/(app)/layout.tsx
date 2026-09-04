import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let microsoftConnected = false; let liveEnabled = false;
  if (supabase && user) {
    const [integration, preferences] = await Promise.all([
      supabase.from("microsoft_integrations").select("connection_status").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_preferences").select("live_sending_enabled").eq("user_id", user.id).maybeSingle(),
    ]);
    microsoftConnected = integration.data?.connection_status === "connected";
    liveEnabled = preferences.data?.live_sending_enabled ?? false;
  }
  return <div className="app-grid"><Sidebar /><div className="min-w-0"><AppHeader email={user?.email} microsoftConnected={microsoftConnected} liveEnabled={liveEnabled} />{!supabase && <div className="border-b border-[#f0d49e] bg-[#fff8e9] px-6 py-2 text-center text-xs text-[#82510d]">Preview mode: add Supabase environment variables to enable persistence and authentication.</div>}{children}</div></div>;
}
