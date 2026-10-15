import { z } from "zod";
import { checked, scheduleUser, schedulingFailure, smallJson } from "@/lib/scheduling/server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, database } = await scheduleUser(request); const id = z.string().uuid().parse((await params).id);
    const input = z.object({ itemId: z.string().uuid(), outcome: z.enum(["accepted", "not_sent"]), confirmed: z.literal(true) }).parse(await smallJson(request));
    checked(await database.rpc("scheduler_resolve_unknown", { p_owner: user.id, p_batch: id, p_item: input.itemId, p_accepted: input.outcome === "accepted" }));
    return Response.json({ ok: true });
  } catch (error) { return schedulingFailure(error); }
}
