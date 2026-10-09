import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { configurationInput, normalizeConfiguration } from "@/lib/microsoft/authority";
import { configurationForUser } from "@/lib/microsoft/configuration-server";

async function currentUser() {
  const client = await getSupabaseServerClient();
  if (!client) throw new Error("Sign in before connecting Microsoft.");
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Sign in again before connecting Microsoft.");
  const { data: access, error: accessError } = await client.rpc("workspace_access_allowed");
  if (accessError) throw new Error("Account security checks are unavailable. Ask the administrator to apply the latest account-controls migration.");
  if (!access) throw new Error("This account is being deleted. Its Microsoft connection cannot be changed.");
  return user;
}
function failure(error: unknown) { return Response.json({ error: error instanceof z.ZodError ? "Enter valid Client and Tenant IDs. Account-type overrides are optional advanced settings." : error instanceof Error ? error.message : "Microsoft configuration is unavailable." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const url = new URL(request.url);
    const configuration = await configurationForUser(user.id);
    const { data: integration } = await privilegedDatabase().from("microsoft_integrations").select("resolved_authority,home_account_id").eq("user_id", user.id).maybeSingle();
    if (integration?.home_account_id && integration.resolved_authority !== configuration.authority) throw new Error("Microsoft Supported account types changed. Reconnect your sender in Settings before sending.");
    if (url.searchParams.has("clientId") && (url.searchParams.get("clientId")?.toLowerCase() !== configuration.client_id.toLowerCase() || url.searchParams.get("tenantId")?.toLowerCase() !== configuration.tenant_id.toLowerCase())) throw new Error("The selected configuration changed. Refresh and reconnect before sending.");
    return Response.json({ configuration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    await limitRequest(`microsoft-config:${user.id}`, 30);
    const body = await request.json();
    const database = privilegedDatabase();
    const { data: defaults } = await database.from("microsoft_default_configuration").select("allow_custom").maybeSingle();
    // Clear obsolete manually entered restrictions, including on databases with the old trigger.
    // Account identity is still pinned to the explicitly selected Microsoft sender.
    const clear = { expected_email: null, connected_email: null, home_account_id: null, display_name: null, connection_status: "not_connected", resolved_authority: null, permission_scopes: [], last_error: null };
    if (body.action === "save") {
      if (defaults && !defaults.allow_custom) throw new Error("Personal configurations are disabled by the administrator.");
      const input = normalizeConfiguration(configurationInput.parse(body));
      const { data: configuration, error } = await database.from("microsoft_user_configurations").upsert({ ...input, user_id: user.id, detected_audience: null, verified_at: null, validated_at: null, validation_error: null, updated_at: new Date().toISOString() }, { onConflict: "user_id,client_id,tenant_id" }).select("*").single();
      if (error) throw new Error("Could not save your Microsoft configuration.");
      const { error: selectionError } = await database.from("microsoft_integrations").upsert({ user_id: user.id, configuration_id: configuration.id, connection_method: "custom", tenant_id: configuration.tenant_id, client_id: configuration.client_id, ...clear }, { onConflict: "user_id" });
      if (selectionError) throw new Error("Configuration saved, but could not select it. Refresh and choose it again.");
      return Response.json({ configuration });
    }
    if (body.action === "disconnect" || body.action === "remove") {
      if (body.action === "remove") {
        const id = z.string().uuid().parse(body.id);
        const { error } = await database.from("microsoft_user_configurations").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw new Error("Could not remove this configuration.");
        const { error: clearError } = await database.from("microsoft_integrations").update({ ...clear, configuration_id: null }).eq("user_id", user.id).eq("configuration_id", id);
        if (clearError) throw new Error("Configuration removed. Refresh before choosing a new sender.");
      } else {
        const { error } = await database.from("microsoft_integrations").update(clear).eq("user_id", user.id);
        if (error) throw new Error("Could not disconnect the saved sender.");
      }
      return Response.json({ ok: true });
    }
    const selection = z.object({ method: z.enum(["default", "custom"]).optional(), id: z.string().uuid().optional(), signInEndpoint: z.literal("tenant").optional() }).parse(body);
    const configuration = await configurationForUser(user.id, { ...selection, signInEndpoint: body.action === "select" ? selection.signInEndpoint : undefined, force: ["validate", "select", "connect"].includes(body.action) });
    if (body.action === "validate") return Response.json({ configuration });
    if (body.action === "select") {
      const { error } = await database.from("microsoft_integrations").upsert({ user_id: user.id, configuration_id: configuration.id, connection_method: configuration.method, tenant_id: configuration.tenant_id, client_id: configuration.client_id, ...clear, resolved_authority: configuration.authority }, { onConflict: "user_id" });
      if (error) throw new Error("Could not select this configuration.");
      return Response.json({ configuration });
    }
    if (body.action === "connect" || body.action === "verify") {
      const input = z.object({ accessToken: z.string().min(1).max(20000), homeAccountId: z.string().min(1).max(500), authority: z.string(), configurationId: z.string().uuid(), clientId: z.string().uuid(), accountType: z.enum(["personal","organization","unknown"]).default("unknown") }).parse(body);
      if (input.authority !== configuration.authority || input.configurationId !== configuration.id || input.clientId.toLowerCase() !== configuration.client_id.toLowerCase()) throw new Error("Microsoft configuration changed during login. Refresh and connect again.");
      if (body.action === "verify" && input.homeAccountId !== configuration.home_account_id) throw new Error("The saved Microsoft account changed. Reconnect explicitly.");
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${input.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Microsoft did not verify this account. Reconnect and grant User.Read.");
      const profile = await response.json();
      const email = profile.mail || profile.userPrincipalName;
      if (!z.string().email().safeParse(email).success) throw new Error("Microsoft did not provide a usable mailbox address. Ask your administrator to check mailbox availability.");
      const verifiedAt = new Date().toISOString();
      if (body.action === "verify") {
        if (![profile.mail,profile.userPrincipalName].some((value) => value?.toLowerCase() === configuration.connected_email?.toLowerCase())) throw new Error("The verified mailbox differs from the saved sender. Reconnect the intended account.");
        const { data: saved, error } = await database.from("microsoft_integrations").update({ expected_email: null, last_verified_at: verifiedAt }).eq("user_id",user.id).eq("configuration_id",configuration.id).eq("home_account_id",input.homeAccountId).eq("connection_status","connected").select("id").maybeSingle();
        if (error || !saved) throw new Error("The saved sender changed while testing. Reconnect and verify again.");
        return Response.json({ verified_at: verifiedAt });
      }
      const { error } = await database.from("microsoft_integrations").upsert({ user_id: user.id, configuration_id: configuration.id, configuration_version: configuration.updated_at, connection_method: configuration.method, tenant_id: configuration.tenant_id, client_id: configuration.client_id, home_account_id: input.homeAccountId, expected_email: null, connected_email: email, display_name: String(profile.displayName ?? "").slice(0,200), account_type: input.accountType, resolved_authority: configuration.authority, last_verified_at: verifiedAt, connection_status: "connected", last_connected_at: new Date().toISOString(), last_error: null }, { onConflict: "user_id" });
      if (error) throw new Error("Account verified, but its connection could not be saved. Reconnect before sending.");
      return Response.json({ email, configuration, verified_at: verifiedAt });
    }
    throw new Error("Unsupported Microsoft settings action.");
  } catch (error) { return failure(error); }
}
