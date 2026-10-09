import { z } from "zod";
import { POST as administratorLogin } from "@/app/api/admin/login/route";
import { adminAuthClient, assertSameOrigin, clearAdministratorCookies } from "@/lib/admin/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).parse(await request.clone().json());
    if (input.email.toLowerCase() === process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase()) {
      const response = await administratorLogin(request);
      if (!response.ok) return response;
      return Response.json({ ok: true, destination: "/admin" }, { headers: { "Cache-Control": "no-store" } });
    }
    const client = await getSupabaseServerClient();
    if (!client) return Response.json({ error: "Sign-in is unavailable until Supabase is configured." }, { status: 503 });
    const { error } = await client.auth.signInWithPassword(input);
    if (error) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    await (await adminAuthClient()).auth.signOut({ scope: "local" });
    await clearAdministratorCookies();
    return Response.json({ ok: true, destination: "/dashboard" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Enter a valid email and password." : "Sign-in could not be completed. Try again." }, { status: 400 });
  }
}
