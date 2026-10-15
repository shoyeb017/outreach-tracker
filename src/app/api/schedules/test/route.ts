import { z } from "zod";
import { validScheduleTime } from "@/lib/scheduling/core";
import { backgroundStatus, checked, scheduleUser, schedulerHealth, schedulingFailure, smallJson } from "@/lib/scheduling/server";
import { SCHEDULE_TEST_MESSAGE } from "@/lib/scheduling/test-message";

const upgrade = "Scheduled test emails are not available yet. Apply 20261016_scheduled_test_mail.sql after the scheduling migration.";
const inputSchema = z.object({ recipient: z.string().trim().toLowerCase().max(254).email(), scheduledAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100), expectedSender: z.string().min(1).max(320), requestKey: z.string().uuid(), confirmed: z.literal(true) });

export async function GET() {
  try {
    const context = await scheduleUser();
    checked(await context.database.from("scheduled_mail_batches").select("kind").eq("user_id", context.user.id).limit(1), upgrade);
    const [health, connection, preference] = await Promise.all([schedulerHealth(context.database), backgroundStatus(context), context.database.from("user_preferences").select("live_sending_enabled").eq("user_id", context.user.id).maybeSingle()]);
    return Response.json({ health, connection, liveEnabled: checked(preference)?.live_sending_enabled === true, message: SCHEDULE_TEST_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
export async function POST(request: Request) {
  try {
    const context = await scheduleUser(request);
    const parsed = inputSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new Error("Enter one valid recipient address, choose a send time, and confirm that this sends a real test email.");
    const input = parsed.data;
    // Recover a lost confirmation response before repeating time/availability checks.
    const existing = checked(await context.database.from("scheduled_mail_batches").select("id,kind,items:scheduled_mail_items(recipient_email)").eq("user_id", context.user.id).eq("request_key", input.requestKey).maybeSingle(), upgrade);
    if (existing) {
      if (existing.kind !== "test" || !existing.items?.some((item: { recipient_email: string }) => item.recipient_email === input.recipient)) throw new Error("This confirmation was already used. Refresh Scheduled emails before continuing.");
      return Response.json({ id: existing.id, existing: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const scheduledAt = validScheduleTime(input.scheduledAt, input.timezone);
    const health = await schedulerHealth(context.database);
    if (!health.enabled || !health.healthy) throw new Error("The worker is paused or offline. A scheduled test cannot bypass worker setup.");
    if (!(await backgroundStatus(context)).connected) throw new Error("Enable background access for your connected Microsoft sender first.");
    // The RPC atomically rechecks real sending, authorization, suppression, caps
    // and pending/unknown tests. It chooses the fixed subject/body, never the caller.
    const id = checked(await context.database.rpc("scheduler_create_test", { p_owner: context.user.id, p_recipient: input.recipient, p_time: scheduledAt, p_timezone: input.timezone, p_key: input.requestKey, p_sender: input.expectedSender }), upgrade);
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
