import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() { const supabase = await getSupabaseServerClient(); const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } }; const { data: profile } = supabase && user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null }; return <main className="page-shell py-10"><OnboardingWizard email={user?.email ?? ""} fullName={profile?.full_name ?? String(user?.user_metadata?.full_name ?? "")} /></main>; }
