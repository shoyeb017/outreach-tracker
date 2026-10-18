import { engagementChecked, engagementFailure, engagementJson, engagementOrigin, engagementUser, loadEngagement, settingsInput } from "@/lib/engagement/server";
export async function GET() {
  try { const { database, user } = await engagementUser(); return Response.json({ settings: await loadEngagement(database, user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return engagementFailure(error); }
}
export async function PUT(request: Request) {
  try {
    const { database, user } = await engagementUser(request);
    const settings = settingsInput.parse(await engagementJson(request));
    if (settings.enabled) engagementOrigin();
    engagementChecked(await database.from("email_engagement_settings").upsert({ ...settings, user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("user_id").single());
    return Response.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return engagementFailure(error); }
}
