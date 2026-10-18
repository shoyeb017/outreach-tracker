import { z } from "zod";
import { engagementChecked, engagementFailure, engagementJson, engagementUser } from "@/lib/engagement/server";
export async function DELETE(request: Request) {
  try {
    const { database, user } = await engagementUser(request);
    z.object({ confirmed: z.literal(true) }).parse(await engagementJson(request));
    engagementChecked(await database.from("email_engagement_messages").delete().eq("user_id", user.id));
    return Response.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
