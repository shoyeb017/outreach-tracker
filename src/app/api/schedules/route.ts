import { z } from "zod";
import { validScheduleTime } from "@/lib/scheduling/core";
import { backgroundStatus, checked, prepareSchedule, scheduleUser, schedulerHealth, schedulingFailure, selectionInput, smallJson } from "@/lib/scheduling/server";
export async function GET(request: Request) {
  try {
    const context = await scheduleUser();
    const page = Math.max(1, Math.min(10000, Number(new URL(request.url).searchParams.get("page")) || 1));
    const view = new URL(request.url).searchParams.get("view") ?? "upcoming";
    const statuses = view === "history" ? ["completed", "completed_with_errors", "cancelled"] : view === "attention" ? ["paused", "reconnect_required", "needs_attention", "completed_with_errors"] : ["scheduled", "running", "paused", "reconnect_required", "needs_attention"];
    const result = await context.database.from("scheduled_mail_batches").select("*,items:scheduled_mail_items(status)", { count: "exact" }).eq("user_id", context.user.id).is("deleted_at", null).in("status", statuses).order(view === "upcoming" ? "scheduled_at" : "created_at", { ascending: view === "upcoming" }).range((page - 1) * 20, page * 20 - 1);
    const batches = checked(result);
    const [health, connection] = await Promise.all([schedulerHealth(context.database), backgroundStatus(context)]);
    return Response.json({ batches, total: result.count ?? 0, page, health, connection }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
export async function POST(request: Request) {
  try {
    const context = await scheduleUser(request);
    const input = selectionInput.extend({ scheduledAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().uuid(), confirmed: z.literal(true) }).parse(await smallJson(request));
    const existing = checked(await context.database.from("scheduled_mail_batches").select("id,dataset_id").eq("user_id", context.user.id).eq("request_key", input.requestKey).maybeSingle());
    if (existing) {
      if (existing.dataset_id !== input.datasetId) throw new Error("This confirmation was already used. Refresh Scheduled emails before continuing.");
      return Response.json({ id: existing.id, existing: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const scheduledAt = validScheduleTime(input.scheduledAt, input.timezone);
    const preview = await prepareSchedule(context, input);
    if (input.expectedHash !== preview.hash) throw new Error("Your emails, settings, or safety checks changed. Close this window and review again before scheduling.");
    if (!preview.readyCount) throw new Error("There are no ready recipients to schedule.");
    const health = await schedulerHealth(context.database);
    if (!health.enabled || !health.healthy) throw new Error("The scheduled-send worker is paused or offline. Nothing has been scheduled.");
    if (preview.live && !(await backgroundStatus(context)).connected) throw new Error("Enable background Microsoft access before scheduling real emails.");
    const id = checked(await context.database.rpc("scheduler_create_batch", { p_owner: context.user.id, p_dataset: input.datasetId, p_time: scheduledAt, p_timezone: input.timezone, p_live: preview.live, p_policy: input.duplicatePolicy, p_key: input.requestKey, p_items: preview.items.filter((item) => item.status === "ready") }));
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
