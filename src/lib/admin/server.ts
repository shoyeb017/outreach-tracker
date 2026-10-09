import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sameOrigin } from "./security";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_SECONDS, createEnvironmentAdminSession, validEnvironmentAdminSession } from "./environment-session";

export function privilegedDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server administration is not configured. Contact the application administrator.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function adminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Administrator login is disabled until Supabase is configured.");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { name: "outreach-admin-auth", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" },
    cookies: { getAll: () => jar.getAll(), setAll: (values) => { try { values.forEach(({ name, value, options }) => jar.set(name, value, { ...options, httpOnly: true })); } catch { /* Refreshed by the admin proxy on page requests. */ } } },
  });
}
export async function administrator() {
  if (!process.env.ADMIN_LOGIN_EMAIL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const email = process.env.ADMIN_LOGIN_EMAIL.trim().toLowerCase();
  if (process.env.ADMIN_LOGIN_PASSWORD) {
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    // Environment credentials are authoritative; never fall back to an old provider session.
    return validEnvironmentAdminSession(token) ? { id: null, email } : null;
  }
  const client = await adminAuthClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.email?.toLowerCase() !== email) return null;
  const { data: role } = await client.from("application_administrators").select("user_id").eq("user_id", user.id).eq("enabled", true).maybeSingle();
  return role ? { id: user.id, email } : null;
}
export async function requireAdministrator() {
  const admin = await administrator();
  if (!admin) redirect("/login?next=/admin");
  return admin;
}
export async function clearAdministratorCookies() {
  const jar = await cookies();
  for (const cookie of jar.getAll()) if (cookie.name.startsWith("outreach-admin-auth") || cookie.name === "outreach-local-admin" || cookie.name === ADMIN_SESSION_COOKIE) jar.delete(cookie.name);
}
export async function setEnvironmentAdministratorCookie() {
  (await cookies()).set(ADMIN_SESSION_COOKIE, createEnvironmentAdminSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: ADMIN_SESSION_SECONDS });
}
export function assertSameOrigin(request: Request) {
  if (!sameOrigin(request, process.env.NEXT_PUBLIC_APP_URL)) throw new Error("This request was not sent from the configured website. Refresh and try again.");
}
export async function limitRequest(key: string, limit = 20, seconds = 60) {
  const { data, error } = await privilegedDatabase().rpc("consume_security_limit", { p_key: key, p_limit: limit, p_seconds: seconds });
  if (error) throw new Error("Security checks are unavailable. Try again later.");
  if (!data) throw new Error("Too many requests. Wait before trying again.");
}
