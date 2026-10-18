import { z } from "zod";
import { validScheduleTime } from "@/lib/scheduling/core";
import { checked, scheduleUser, schedulingFailure, smallJson } from "@/lib/scheduling/server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, database } = await scheduleUser(); const id = z.string().uuid().parse((await params).id);
    const batch = checked(await database.from("scheduled_mail_batches").select("*").eq("id", id).eq("user_id", user.id).is("deleted_at", null).single(), "This schedule is not available.");
    const items = checked(await database.from("scheduled_mail_items").select("*").eq("batch_id", id).eq("user_id", user.id).order("id"));
    return Response.json({ batch, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, database } = await scheduleUser(request); const id = z.string().uuid().parse((await params).id);
    const input = z.object({ action: z.enum(["pause", "cancel", "reschedule"]), scheduledAt: z.string().datetime({ offset: true }).optional(), timezone: z.string().min(1).max(100).optional(), confirmed: z.literal(true) }).parse(await smallJson(request));
    if (input.action === "reschedule") validScheduleTime(input.scheduledAt ?? "", input.timezone ?? "");
    checked(await database.rpc("scheduler_change_batch", { p_owner: user.id, p_batch: id, p_action: input.action, p_time: input.scheduledAt ?? null, p_timezone: input.timezone ?? null }));
    return Response.json({ ok: true });
  } catch (error) { return schedulingFailure(error); }
}
