import { z } from "zod";
import { engagementChecked, engagementFailure, engagementJson, engagementUser } from "@/lib/engagement/server";
export async function DELETE(request: Request) {
  try {
    const { database, user } = await engagementUser(request);
    z.object({ confirmed: z.literal(true) }).parse(await engagementJson(request));
    const rows = engagementChecked(await database.from("email_engagement_messages").select("id").eq("user_id", user.id).limit(501)) ?? [];
    if (rows.length > 500) throw new Error("Remove records in selections of up to 500. Pending or unknown sends must be resolved first.");
    if (rows.length) engagementChecked(await database.rpc("records_delete_selection", { p_owner: user.id, p_kind: "engagement", p_ids: rows.map(row => row.id) }));
    return Response.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
