import { cookies } from "next/headers";
import { z } from "zod";
import { configurationForUser } from "@/lib/microsoft/configuration-server";
import { checked, scheduleUser, schedulingFailure, smallJson } from "@/lib/scheduling/server";
import { digest, pkceChallenge, randomSecret, seal } from "@/lib/scheduling/core";

export async function POST(request: Request) {
  try {
    const { user, database } = await scheduleUser(request);
    const { clientSecret } = z.object({ clientSecret: z.string().min(1).max(8000).optional() }).parse(await smallJson(request));
    const key = process.env.SCHEDULE_ENCRYPTION_KEY;
    if (!key) throw new Error("The administrator must configure scheduled sending first. See Help → Scheduled emails.");
    const configuration = await configurationForUser(user.id);
    if (!configuration.home_account_id || !configuration.connected_email) throw new Error("Connect your Microsoft sender in Settings first.");
    const credential = configuration.method === "custom" ? clientSecret : configuration.client_id.toLowerCase() === process.env.MICROSOFT_SCHEDULER_CLIENT_ID?.toLowerCase() ? process.env.MICROSOFT_SCHEDULER_CLIENT_SECRET : undefined;
    if (!credential) throw new Error(configuration.method === "custom" ? "Your own registration needs its client-secret Value for background access. It is encrypted and never returned to the browser." : "The administrator must configure a background credential for the default Microsoft registration.");
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("Scheduled sending requires an HTTPS application URL.");
    const redirectUri = new URL("/api/microsoft/background/callback", origin.origin).href;
    const state = randomSecret(); const verifier = randomSecret();
    const payload = { configurationId: configuration.id, configurationVersion: configuration.updated_at, method: configuration.method, clientId: configuration.client_id, authority: configuration.authority, senderEmail: configuration.connected_email, homeAccountId: configuration.home_account_id, redirectUri,
      verifier: await seal(verifier, key, `${user.id}:oauth`), credential: await seal(credential, key, `${user.id}:credential`) };
    checked(await database.from("background_mail_oauth_states").insert({ state_hash: await digest(state), user_id: user.id, payload }));
    (await cookies()).set("autmail-background-oauth", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/microsoft/background/callback", maxAge: 600 });
    const query = new URLSearchParams({ client_id: configuration.client_id, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send offline_access", state, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256", prompt: "consent", login_hint: configuration.connected_email });
    return Response.json({ url: `${configuration.authority}/oauth2/v2.0/authorize?${query}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
