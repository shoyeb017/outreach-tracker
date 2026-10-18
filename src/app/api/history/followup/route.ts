import { z } from "zod";
import { engagementJson, engagementUser } from "@/lib/engagement/server";

export async function POST(request: Request) {
  try {
    const { user, database } = await engagementUser(request);
    const input = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), name: z.string().trim().min(1).max(120), requestKey: z.string().uuid(), confirmed: z.literal(true) }).parse(await engagementJson(request));
    const { data, error } = await database.rpc("history_create_followup", { p_owner: user.id, p_ids: [...new Set(input.ids)], p_name: input.name, p_key: input.requestKey });
    if (error) throw new Error(error.code === "P0001" ? error.message : "Follow-up creation is unavailable. Apply the history-followups migration and check server access.");
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Select 1–500 emails, give the spreadsheet a name and confirm creation." : error instanceof Error ? error.message : "Could not create the follow-up spreadsheet." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
