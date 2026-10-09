import { z } from "zod";
import { administrator, assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { deleteAccount } from "@/lib/admin/account-controls";

export const runtime = "nodejs";
export const maxDuration = 60;
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), confirmation: z.string().email().max(320), acknowledged: z.literal(true) }),
  z.object({ action: z.literal("disconnect") }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    assertSameOrigin(request);
    const actor = await administrator();
    if (!actor) return Response.json({ error: "Administrator sign-in required." }, { status: 401, headers });
    const id = z.string().uuid().parse((await params).id).toLowerCase();
    const input = inputSchema.parse(await request.json());
    await limitRequest(`admin-account:${actor.email}`, 10);
    const db = privilegedDatabase();
    if (input.action === "delete") await deleteAccount(db, id, input.confirmation, actor);
    else {
      const { data: disconnected, error } = await db.rpc("admin_disconnect_sender", { p_target: id, p_actor: actor.id, p_email: actor.email });
      if (error) throw new Error(error.code === "P0001" ? error.message : "Account controls are unavailable. Apply the admin-controls migration first.");
      if (disconnected !== true) throw new Error("Sender disconnection was not confirmed. Refresh the account before retrying.");
    }
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Check the account and confirmation details." : error instanceof Error ? error.message : "Account action failed. Refresh and try again." }, { status: 400, headers });
  }
}
