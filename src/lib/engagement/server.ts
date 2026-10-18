import "server-only";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { defaultEngagement, engagementSettings, validDestination } from "./core";

export const settingsInput = z.object({ enabled: z.boolean(), collection_enabled: z.boolean(), destination: z.string().trim().max(2048), intro: z.string().max(600), button_text: z.string().trim().min(1).max(80), button_color: z.string().regex(/^#[a-f0-9]{6}$/i), text_color: z.string().regex(/^#[a-f0-9]{6}$/i), alignment: z.enum(["left", "center", "right"]), size: z.enum(["small", "medium", "large"]), placement: z.enum(["before_signature", "after_signature"]) }).refine(value => !value.enabled || validDestination(value.destination), { message: "Enter a public HTTPS website address, such as https://inuberry.com." });
export async function engagementUser(request?: Request) {
  if (request) assertSameOrigin(request);
  const client = await getSupabaseServerClient();
  if (!client) throw new Error("Sign in to manage email engagement.");
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Sign in again to manage email engagement.");
  const access = await client.rpc("workspace_access_allowed");
  if (access.error || !access.data) throw new Error("Workspace access could not be verified. Try again.");
  if (request) await limitRequest(`engagement:${new URL(request.url).pathname.endsWith("/prepare") ? "prepare:" : ""}${user.id}`, new URL(request.url).pathname.endsWith("/prepare") ? 600 : 60);
  return { user, client, database: privilegedDatabase() };
}
export function engagementChecked<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    const error = result.error as { code?: string; message?: string };
    throw new Error(error.code === "P0001" && error.message ? error.message : "Email engagement is unavailable. Apply the email-engagement migration and check server access.");
  }
  return result.data;
}
export async function loadEngagement(database: ReturnType<typeof privilegedDatabase>, owner: string) {
  const data = engagementChecked(await database.from("email_engagement_settings").select("*").eq("user_id", owner).maybeSingle());
  return engagementSettings(data ?? defaultEngagement);
}
export function engagementOrigin() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if ((url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && url.hostname === "localhost")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Set NEXT_PUBLIC_APP_URL to the public website origin before enabling engagement.");
  return url.origin;
}
export async function engagementJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 30000) throw new Error("This request is too large. Select up to 500 messages.");
  try { return JSON.parse(raw); } catch { throw new Error("Invalid request. Refresh and try again."); }
}
export function engagementFailure(error: unknown) {
  return Response.json({ error: error instanceof z.ZodError ? error.issues[0]?.message ?? "Check the engagement settings." : error instanceof Error ? error.message : "Email engagement is unavailable." }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
