import { privilegedDatabase } from "@/lib/admin/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { activityKind, validDestination } from "@/lib/engagement/core";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
async function resolve(request: Request, token: string, head = false) {
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("This link is unavailable or has expired.", { status: 404, headers });
  try {
    const database = privilegedDatabase();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, "0")).join("");
    let viewer: string | null = null;
    if (request.headers.get("cookie")?.includes("sb-")) {
      try { const client = await getSupabaseServerClient(); viewer = (await client?.auth.getUser())?.data.user?.id ?? null; } catch { /* A recipient needs no account. */ }
    }
    const result = await database.rpc("engagement_visit", { p_hash: hash, p_kind: head ? "ignore" : activityKind(request.headers), p_viewer: viewer }).abortSignal(AbortSignal.timeout(4000));
    let destination = result.data as string | null;
    // Recording failure must not redirect to an untrusted request parameter or expose a database error.
    if (result.error) {
      const fallback = await database.from("email_engagement_messages").select("destination").eq("token_hash", hash).gt("expires_at", new Date().toISOString()).abortSignal(AbortSignal.timeout(3000)).maybeSingle();
      destination = fallback.data?.destination ?? null;
    }
    if (!destination || !validDestination(destination)) return new Response("This link is unavailable or has expired.", { status: 404, headers });
    return new Response(null, { status: 302, headers: { ...headers, Location: destination } });
  } catch { return new Response("This link is temporarily unavailable. Please try again later.", { status: 503, headers }); }
}
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) { return resolve(request, (await context.params).token); }
export async function HEAD(request: Request, context: { params: Promise<{ token: string }> }) { return resolve(request, (await context.params).token, true); }
