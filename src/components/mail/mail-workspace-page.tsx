import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MailWorkspace } from "./mail-workspace";
import { ComposeWorkspace } from "./compose-workspace";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

export async function MailWorkspacePage({ compose = false, preview = false }: { compose?: boolean; preview?: boolean }) {
  const database = await getSupabaseServerClient();
  const user = database ? (await database.auth.getUser()).data.user : null;
  const [integration, signature] = database && user ? await Promise.all([
    database.from("microsoft_integrations").select("*").eq("user_id", user.id).maybeSingle(),
    database.from("signature_fields").select("*").eq("user_id", user.id).order("display_order"),
  ]) : [{ data: null, error: null }, { data: [], error: null }];
  const designPreview = isUiTestMode() && !database && preview;
  const Workspace = compose ? ComposeWorkspace : MailWorkspace;
  return <Workspace integration={integration.data} signatureFields={signature.data ?? []} designPreview={designPreview} setupError={integration.error || signature.error ? "Mailbox settings could not be loaded. Refresh or check your account settings." : ""} />;
}
