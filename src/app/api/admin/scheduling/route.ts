import { z } from "zod";
import { administrator, assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { checked, schedulerHealth, schedulingFailure, smallJson } from "@/lib/scheduling/server";
export async function GET() {
  try {
    if (!await administrator()) return Response.json({ error: "Administrator sign-in required." }, { status: 401 });
    const health = await schedulerHealth(privilegedDatabase());
    return Response.json({ ...health, encryptionConfigured: !!process.env.SCHEDULE_ENCRYPTION_KEY, defaultCredentialConfigured: !!process.env.MICROSOFT_SCHEDULER_CLIENT_ID && !!process.env.MICROSOFT_SCHEDULER_CLIENT_SECRET }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); const admin = await administrator();
    if (!admin) return Response.json({ error: "Administrator sign-in required." }, { status: 401 });
    await limitRequest(`admin-scheduler:${admin.email}`, 10);
    const { enabled } = z.object({ enabled: z.boolean(), confirmed: z.literal(true) }).parse(await smallJson(request));
    const database = privilegedDatabase(); const health = await schedulerHealth(database);
    if (enabled && (!process.env.SCHEDULE_ENCRYPTION_KEY || !health.healthy)) throw new Error("Configure the encryption key, deploy the worker and enable its Cron trigger first. A recent worker check is required before enabling sends.");
    // Record the administrative decision before changing the global switch.
    checked(await database.from("admin_audit_log").insert({ actor_id: admin.id, actor_email: admin.email, action: enabled ? "scheduled_sending_enabled" : "scheduled_sending_paused", details: { enabled } }));
    checked(await database.from("scheduled_mail_control").update({ enabled }).eq("id", true));
    return Response.json({ ok: true });
  } catch (error) { return schedulingFailure(error); }
}
