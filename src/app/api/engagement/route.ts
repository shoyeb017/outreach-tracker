import { z } from "zod";
import { engagementChecked, engagementFailure, engagementJson, engagementUser } from "@/lib/engagement/server";
export async function GET(request: Request) {
  try {
    const { user, database } = await engagementUser();
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(query.get("page")) || 1));
    const view = query.get("view") ?? "all";
    let messages = database.from("email_engagement_messages").select("id,dataset_id,campaign_id,dataset_name,template_name,recipient_email,subject,destination,status,accepted_at,first_activity_at,last_activity_at,activity_count,suspected_count,last_suspected_at,created_at,expires_at", { count: "exact" }).eq("user_id", user.id).gt("expires_at", new Date().toISOString());
    const source = query.get("source"), campaign = query.get("campaign");
    if (source) messages = messages.eq("dataset_id", z.string().uuid().parse(source));
    if (campaign) messages = messages.eq("campaign_id", z.string().uuid().parse(campaign));
    if (view === "activity") messages = messages.eq("status", "accepted").gt("activity_count", 0);
    if (view === "none") messages = messages.eq("status", "accepted").eq("activity_count", 0);
    if (view === "untouched") messages = messages.eq("status", "accepted").eq("activity_count", 0).eq("suspected_count", 0);
    if (view === "suspected") messages = messages.gt("suspected_count", 0);
    if (view === "attention") messages = messages.neq("status", "accepted");
    const search = (query.get("search") ?? "").slice(0, 120).replace(/[%_\\]/g, "");
    if (search) messages = messages.ilike("recipient_email", `%${search}%`);
    const selecting = query.get("selection") === "1";
    const result = await messages.order("created_at", { ascending: false }).order("id").range(selecting ? 0 : (page - 1) * 50, selecting ? 499 : page * 50 - 1);
    const data = engagementChecked(result);
    const metadata = selecting ? {} : engagementChecked(await database.rpc("engagement_sources", { p_owner: user.id }));
    return Response.json({ messages: data, total: result.count ?? 0, page, ...metadata }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, database } = await engagementUser(request);
    const input = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), name: z.string().trim().min(1).max(120), requestKey: z.string().uuid(), confirmed: z.literal(true) }).parse(await engagementJson(request));
    const result = engagementChecked(await database.rpc("engagement_create_followup", { p_owner: user.id, p_ids: [...new Set(input.ids)], p_name: input.name, p_key: input.requestKey }));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
