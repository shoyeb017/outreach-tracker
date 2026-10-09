import "server-only";
import { administrator } from "@/lib/admin/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Use verified sessions, not URL parameters, to keep public navigation in the right context.
// This only chooses links; protected routes still enforce their own authorization.
export async function publicNavigation() {
  const admin = await administrator();
  if (admin) return { signedIn: true, destination: "/admin", label: "Open administration", helpDestination: "/admin", helpLabel: "Back to administration" };
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (data.user) return { signedIn: true, destination: "/dashboard", label: "Open workspace", helpDestination: "/settings#microsoft", helpLabel: "Back to Email account settings" };
  return { signedIn: false, destination: "/login", label: "Sign in", helpDestination: "/", helpLabel: "Back to landing page" };
}
