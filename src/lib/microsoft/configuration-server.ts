import "server-only";
import { z } from "zod";
import { privilegedDatabase } from "@/lib/admin/server";
import { audiences, resolveAuthority, type MicrosoftConfiguration, type ResolvedMicrosoftConfiguration } from "./authority";

export async function detectConfiguration(configuration: MicrosoftConfiguration, force = false): Promise<MicrosoftConfiguration> {
  const cacheAge = configuration.validated_at ? Date.now() - Date.parse(configuration.validated_at) : Number.NaN;
  if (!force && cacheAge >= 0 && cacheAge < 300_000) return configuration;
  const tenant = process.env.MICROSOFT_READER_TENANT_ID;
  const allowed = (process.env.MICROSOFT_READABLE_APP_IDS ?? "").split(",").map((id) => id.trim().toLowerCase());
  let validation_error = "Account-type metadata is unavailable. You can still connect using automatic sign-in. Microsoft enforces the registration's account restrictions; this is not verified audience detection.";
  let detected_audience: MicrosoftConfiguration["detected_audience"] = null;
  if (tenant?.toLowerCase() === configuration.tenant_id.toLowerCase() && allowed.includes(configuration.client_id.toLowerCase()) && process.env.MICROSOFT_READER_CLIENT_ID && process.env.MICROSOFT_READER_CLIENT_SECRET && z.string().uuid().safeParse(tenant).success) {
    try {
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.MICROSOFT_READER_CLIENT_ID, client_secret: process.env.MICROSOFT_READER_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default" }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!tokenResponse.ok) throw new Error("The metadata reader could not authenticate. Ask the administrator to check its backend credential.");
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error("The metadata reader did not receive an access token.");
      const response = await fetch(`https://graph.microsoft.com/v1.0/applications(appId='${configuration.client_id}')?$select=signInAudience`, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(response.status === 403 ? "The metadata reader needs administrator-approved Application.Read.All. Sending permissions are separate." : "The authorized reader could not find this registration. Check the owning tenant and configured application allowlist.");
      const data = await response.json();
      detected_audience = z.enum(audiences).parse(data.signInAudience);
      validation_error = "";
    } catch (error) { validation_error = error instanceof Error && !error.message.includes("[") ? error.message : "Microsoft metadata validation failed. See Help → Troubleshooting."; }
  }
  return { ...configuration, detected_audience, verified_at: detected_audience ? new Date().toISOString() : null, validated_at: new Date().toISOString(), validation_error: validation_error || null };
}

export async function configurationForUser(userId: string, options: { force?: boolean; method?: "default" | "custom"; id?: string; signInEndpoint?: "tenant" } = {}): Promise<ResolvedMicrosoftConfiguration> {
  const database = privilegedDatabase();
  const { data: integration, error: integrationError } = await database.from("microsoft_integrations").select("*").eq("user_id", userId).maybeSingle();
  if (integrationError) throw new Error("Apply the Microsoft configuration migration before connecting.");
  const { data: defaults, error: defaultsError } = await database.from("microsoft_default_configuration").select("*").maybeSingle();
  if (defaultsError) throw new Error("Microsoft settings are unavailable. Contact the administrator.");
  // New users inherit the administrator's enabled registration; retain explicit saved choices.
  const method = options.method ?? (integration?.configuration_id ? integration.connection_method : defaults?.enabled ? "default" : "custom");
  let configuration: MicrosoftConfiguration;
  if (method === "default") {
    if (!defaults?.enabled) throw new Error("Default Microsoft connection is not available. Ask your application administrator to enable it.");
    configuration = defaults;
  } else {
    if (defaults && !defaults.allow_custom) throw new Error("Personal app registrations are disabled by the application administrator.");
    const id = options.id ?? integration?.configuration_id;
    if (!id || !z.string().uuid().safeParse(id).success) throw new Error("Save and choose a Microsoft configuration first.");
    const { data, error } = await database.from("microsoft_user_configurations").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error || !data) throw new Error("This configuration is not available to your account.");
    configuration = data;
  }
  const checked = await detectConfiguration(configuration, options.force);
  // CAS prevents a delayed validation response from overwriting settings changed in another tab.
  if (checked !== configuration) {
    const query = database.from(method === "default" ? "microsoft_default_configuration" : "microsoft_user_configurations").update({ detected_audience: checked.detected_audience, verified_at: checked.verified_at, validated_at: checked.validated_at, validation_error: checked.validation_error }).eq("id", checked.id).eq("updated_at", configuration.updated_at);
    const { data, error } = await query.select("id").maybeSingle();
    if (error || !data) throw new Error("Configuration changed while validating. Refresh and try again.");
  }
  const audience = checked.detected_audience ?? checked.fallback_audience;
  const sameActive = integration?.configuration_id === checked.id && integration?.connection_method === method;
  const tenantAuthority = resolveAuthority(checked.tenant_id, "AzureADMyOrg");
  // Missing metadata must not block sign-in or fabricate a verified audience.
  // Remember a tenant-specific retry for this owner's selected registration only.
  const authority = audience ? resolveAuthority(checked.tenant_id, audience)
    : options.signInEndpoint === "tenant" || (sameActive && integration?.resolved_authority === tenantAuthority)
      ? tenantAuthority : "https://login.microsoftonline.com/common";
  const sameAuthority = integration?.resolved_authority === authority;
  if (sameActive && integration?.home_account_id && !sameAuthority) {
    const { error } = await database.from("microsoft_integrations").update({ connection_status: "not_connected", home_account_id: null, connected_email: null, resolved_authority: null }).eq("user_id", userId).eq("configuration_id", checked.id).eq("resolved_authority", integration.resolved_authority);
    if (error) throw new Error("Account types changed, but sender invalidation failed. Reconnect explicitly before sending.");
  }
  return { ...checked, method, audience, authority, verification: checked.detected_audience ? "verified" : checked.fallback_audience ? "manual" : "unverified", home_account_id: sameActive && sameAuthority ? integration?.home_account_id ?? null : null, connected_email: sameActive && sameAuthority ? integration?.connected_email ?? null : null, display_name: sameActive && sameAuthority ? integration?.display_name ?? null : null, last_verified_at: sameActive && sameAuthority ? integration?.last_verified_at ?? null : null };
}
