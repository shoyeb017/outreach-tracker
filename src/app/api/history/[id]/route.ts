import { z } from "zod";
import { engagementUser } from "@/lib/engagement/server";
import { historyLoadError } from "@/lib/history/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { user, client } = await engagementUser();
    const result = await client.from("email_history").select("final_html_body,final_plain_text_body").eq("user_id", user.id).eq("id", id).is("deleted_at", null).maybeSingle();
    if (result.error) return Response.json({ error: historyLoadError(result.error.code) }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (!result.data) return Response.json({ error: "This saved email is no longer available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not open the saved email. Check your sign-in and try again." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
