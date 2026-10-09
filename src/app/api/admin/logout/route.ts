import { adminAuthClient, assertSameOrigin, clearAdministratorCookies } from "@/lib/admin/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    try { if (!process.env.ADMIN_LOGIN_PASSWORD) await (await adminAuthClient()).auth.signOut({ scope: "local" }); }
    finally { await clearAdministratorCookies(); }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ error: "Could not sign out." }, { status: 400 }); }
}
