import { z } from "zod";
import { administrator, assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { configurationInput, normalizeConfiguration } from "@/lib/microsoft/authority";
import { detectConfiguration } from "@/lib/microsoft/configuration-server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await administrator();
    if (!admin) return Response.json({ error: "Administrator access required." }, { status: 403 });
    await limitRequest("admin-microsoft", 20);
    const body = await request.json();
    const database = privilegedDatabase();
    if (body.action === "validate") {
      const { data, error } = await database.from("microsoft_default_configuration").select("*").maybeSingle();
      if (error || !data) throw new Error("Save a default configuration first.");
      const checked = await detectConfiguration(data, true);
      const { data: saved, error: updateError } = await database.from("microsoft_default_configuration").update({ detected_audience: checked.detected_audience, verified_at: checked.verified_at, validated_at: checked.validated_at, validation_error: checked.validation_error }).eq("id", data.id).eq("updated_at", data.updated_at).select("*").maybeSingle();
      if (updateError || !saved) throw new Error("Settings changed during validation. Refresh and try again.");
      return Response.json({ configuration: saved }, { headers: { "Cache-Control": "no-store" } });
    }
    const settings = normalizeConfiguration(configurationInput.safeExtend({ enabled: z.boolean(), allow_custom: z.boolean() }).parse(body));
    const { error } = await database.rpc("save_microsoft_default", { p_settings: settings, p_actor: admin.id, p_email: admin.email });
    if (error) throw new Error("Could not save settings and audit record. Check that the migration is installed.");
    const { data: configuration, error: loadError } = await database.from("microsoft_default_configuration").select("*").maybeSingle();
    if (loadError) throw new Error("Settings saved, but the updated configuration could not be loaded. Refresh this page.");
    return Response.json({ ok: true, configuration });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Use valid UUID Client and Tenant IDs, and complete the settings." : error instanceof Error ? error.message : "Settings could not be saved." }, { status: 400 }); }
}
