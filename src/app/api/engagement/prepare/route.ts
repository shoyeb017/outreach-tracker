import { z } from "zod";
import { engagementChecked, engagementFailure, engagementJson, engagementOrigin, engagementUser } from "@/lib/engagement/server";
export async function POST(request: Request) {
  try {
    const { database, user } = await engagementUser(request);
    const { itemId } = z.object({ itemId: z.string().uuid() }).parse(await engagementJson(request));
    const item = engagementChecked(await database.from("send_run_items").select("id").eq("id", itemId).eq("user_id", user.id).maybeSingle());
    if (!item) throw new Error("This email is unavailable.");
    const result = engagementChecked(await database.rpc("engagement_prepare_send", { p_item: itemId, p_origin: engagementOrigin() }));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
