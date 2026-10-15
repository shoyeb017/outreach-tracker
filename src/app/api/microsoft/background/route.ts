import { backgroundStatus, checked, scheduleUser, schedulingFailure, smallJson } from "@/lib/scheduling/server";
export async function GET() {
  try { return Response.json(await backgroundStatus(await scheduleUser()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return schedulingFailure(error); }
}
export async function POST(request: Request) {
  try {
    const context = await scheduleUser(request); const body = await smallJson(request);
    if (body.action !== "disconnect" || body.confirmed !== true) throw new Error("Confirm before disconnecting background access.");
    checked(await context.database.from("background_mail_oauth_states").delete().eq("user_id", context.user.id));
    checked(await context.database.from("background_mail_connections").update({ status: "disconnected", refresh_ciphertext: null, credential_ciphertext: null, reason: "Background access was disconnected by you.", updated_at: new Date().toISOString() }).eq("user_id", context.user.id));
    checked(await context.database.from("scheduled_mail_batches").update({ status: "paused", reason: "Background access was disconnected. Reconnect and choose a new time.", updated_at: new Date().toISOString() }).eq("user_id", context.user.id).eq("live_enabled", true).in("status", ["scheduled", "running", "reconnect_required"]));
    return Response.json({ ok: true });
  } catch (error) { return schedulingFailure(error); }
}
