import { z } from "zod";
import { adminAuthClient, administrator, assertSameOrigin, clearAdministratorCookies, limitRequest, privilegedDatabase, setEnvironmentAdministratorCookie } from "@/lib/admin/server";
import { verifyEnvironmentAdminPassword } from "@/lib/admin/environment-session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
    if (!email) return Response.json({ error: "Administrator login is disabled. Configure the administrator email first." }, { status: 503 });
    await limitRequest("admin-login-global", 60, 60);
    await limitRequest("admin-login-account", 8, 900);
    const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).parse(await request.json());
    const environmentLogin = Boolean(process.env.ADMIN_LOGIN_PASSWORD);
    await clearAdministratorCookies();
    let success = false;
    if (input.email.toLowerCase() === email) {
      if (environmentLogin) success = verifyEnvironmentAdminPassword(input.password);
      else {
        const client = await adminAuthClient();
        const { error } = await client.auth.signInWithPassword({ email, password: input.password });
        success = !error && Boolean(await administrator());
        if (!success) { await client.auth.signOut({ scope: "local" }); await clearAdministratorCookies(); }
      }
    }
    const { error: auditError } = await privilegedDatabase().from("admin_audit_log").insert({ actor_email: email, action: success ? "admin_login_success" : "admin_login_failed", details: {} });
    if (auditError) { if (!environmentLogin) await (await adminAuthClient()).auth.signOut({ scope: "local" }); await clearAdministratorCookies(); throw new Error("Security audit is unavailable. Login was not completed."); }
    if (success && environmentLogin) await setEnvironmentAdministratorCookie();
    return Response.json(success ? { ok: true } : { error: "Email or password is incorrect, or this account does not have administrator access." }, { status: success ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Enter a valid email and password." : error instanceof Error ? error.message : "Login is unavailable." }, { status: 400 }); }
}
