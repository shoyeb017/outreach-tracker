import { cookies } from "next/headers";
import { limitRequest } from "@/lib/admin/server";
import { configurationForUser } from "@/lib/microsoft/configuration-server";
import { authorityAllowed } from "@/lib/microsoft/authority";
import { checked, scheduleUser } from "@/lib/scheduling/server";
import { digest, seal, unseal } from "@/lib/scheduling/core";

export async function GET(request: Request) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).origin;
  const jar = await cookies(); const stateCookie = jar.get("autmail-background-oauth")?.value;
  jar.set("autmail-background-oauth", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/microsoft/background/callback", maxAge: 0 });
  try {
    const query = new URL(request.url).searchParams; const state = query.get("state"); const code = query.get("code");
    if (!state || !stateCookie || state.length > 200 || await digest(state) !== await digest(stateCookie)) throw new Error("Invalid authorization state");
    const { user, database } = await scheduleUser();
    await limitRequest(`background-callback:${user.id}`, 10);
    const saved = checked(await database.from("background_mail_oauth_states").delete().eq("state_hash", await digest(state)).eq("user_id", user.id).gt("expires_at", new Date().toISOString()).select("payload").maybeSingle());
    if (!saved || query.has("error") || !code || code.length > 10000) throw new Error("Authorization did not complete");
    const p = saved.payload;
    const current = await configurationForUser(user.id);
    if (current.id !== p.configurationId || current.updated_at !== p.configurationVersion || current.home_account_id !== p.homeAccountId || current.authority !== p.authority || current.client_id !== p.clientId || !authorityAllowed(p.authority)) throw new Error("Sender configuration changed");
    const key = process.env.SCHEDULE_ENCRYPTION_KEY!;
    const response = await fetch(`${p.authority}/oauth2/v2.0/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: p.clientId, client_secret: await unseal(p.credential, key, `${user.id}:credential`), code, redirect_uri: p.redirectUri, code_verifier: await unseal(p.verifier, key, `${user.id}:oauth`) }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Authorization exchange failed");
    const token = await response.json();
    if (!token.access_token || !token.refresh_token || !String(token.scope ?? "").split(" ").some((scope) => /(?:^|\/)mail.send$/i.test(scope))) throw new Error("Background sending was not approved");
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!profileResponse.ok) throw new Error("Mailbox could not be verified");
    const profile = await profileResponse.json();
    if (!profile.id || ![profile.mail, profile.userPrincipalName].some((email) => typeof email === "string" && email.toLowerCase() === p.senderEmail.toLowerCase())) throw new Error("Choose the same sending mailbox");
    // A new generation never silently resumes old/overdue schedules.
    const id = crypto.randomUUID();
    checked(await database.rpc("scheduler_save_connection", { p_owner: user.id, p_home_account: p.homeAccountId, p_connection: { user_id: user.id, id, configuration_id: p.configurationId, configuration_version: p.configurationVersion, connection_method: p.method, client_id: p.clientId, authority: p.authority, sender_email: p.senderEmail, microsoft_user_id: profile.id, status: "connected", refresh_ciphertext: await seal(token.refresh_token, key, `${user.id}:refresh`), credential_ciphertext: p.credential, reason: null, updated_at: new Date().toISOString() } }));
    return Response.redirect(`${origin}/scheduled?connection=connected`, 303);
  } catch {
    // Never put Microsoft's code, credential, token, or raw provider response in a URL/log.
    return Response.redirect(`${origin}/scheduled?connection=failed`, 303);
  }
}
