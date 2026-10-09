import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function getSignOutMicrosoftClientIds(): Promise<string[]> {
  const client = await getSupabaseServerClient();
  if (!client) return [];
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  const [configurations, integration] = await Promise.all([
    client.from("microsoft_user_configurations").select("client_id").eq("user_id", user.id),
    client.from("microsoft_integrations").select("client_id").eq("user_id", user.id).maybeSingle(),
  ]);
  return [...new Set([...(configurations.data ?? []).map((configuration) => configuration.client_id), ...(integration.data?.client_id ? [integration.data.client_id] : [])])];
}
