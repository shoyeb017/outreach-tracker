import { z } from "zod";
import { engagementJson, engagementUser } from "@/lib/engagement/server";

export async function POST(request: Request) {
  try {
    const { user, database } = await engagementUser(request);
    const input = z.object({ kind: z.enum(["engagement", "history", "schedule"]), ids: z.array(z.string().uuid()).min(1).max(500), confirmed: z.literal(true) }).parse(await engagementJson(request));
    const result = await database.rpc("records_delete_selection", { p_owner: user.id, p_kind: input.kind, p_ids: [...new Set(input.ids)] });
    if (result.error) throw new Error(result.error.code === "P0001" ? result.error.message : "Record removal is unavailable. Apply the record-deletion migration and check server access.");
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Select 1–500 records and confirm removal." : error instanceof Error ? error.message : "Could not remove the selected records." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
