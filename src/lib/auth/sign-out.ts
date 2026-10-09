"use client";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export async function signOutOfApplication(microsoftClientIds: string[] = []) {
  const { clearWorkspaceMicrosoftSessions } = await import("@/lib/microsoft/msal");
  await clearWorkspaceMicrosoftSessions(microsoftClientIds);
  const response = await fetch("/api/admin/logout", { method: "POST" });
  if (!response.ok) throw new Error("Could not clear administrator sessions. Please try signing out again.");
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) throw error;
  }
}
