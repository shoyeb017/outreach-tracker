import { z } from "zod";

export const audiences = ["AzureADMyOrg", "AzureADMultipleOrgs", "AzureADandPersonalMicrosoftAccount", "PersonalMicrosoftAccount"] as const;
export type Audience = typeof audiences[number];
export const PERSONAL_MICROSOFT_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
export const configurationInput = z.object({
  name: z.string().trim().max(100).default("Microsoft configuration"),
  client_id: z.string().uuid(), tenant_id: z.string().trim().uuid().or(z.literal("")).default(""),
  fallback_audience: z.enum(audiences).nullable().default(null),
}).refine((input) => Boolean(input.tenant_id) || input.fallback_audience === "PersonalMicrosoftAccount", { path: ["tenant_id"], message: "Tenant ID is required unless an explicitly personal-only registration has no directory ID." });
export function normalizeConfiguration<T extends z.infer<typeof configurationInput>>(input: T): T {
  return { ...input, tenant_id: input.tenant_id || PERSONAL_MICROSOFT_TENANT };
}
export function resolveAuthority(tenantId: string, audience: Audience) {
  if (!z.string().uuid().safeParse(tenantId).success) throw new Error("Enter a valid Directory (tenant) ID.");
  const suffix = { AzureADMyOrg: tenantId, AzureADMultipleOrgs: "organizations", AzureADandPersonalMicrosoftAccount: "common", PersonalMicrosoftAccount: "consumers" }[audience];
  if (!suffix) throw new Error("Unsupported Microsoft account type.");
  return `https://login.microsoftonline.com/${suffix}`;
}
export function authorityAllowed(value: string) {
  return /^https:\/\/login\.microsoftonline\.com\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|common|organizations|consumers)$/i.test(value);
}
export interface MicrosoftConfiguration {
  id: string; name: string; client_id: string; tenant_id: string; fallback_audience: Audience | null;
  detected_audience: Audience | null; verified_at: string | null; validation_error: string | null;
  validated_at?: string | null;
  enabled?: boolean; allow_custom?: boolean; updated_at: string;
}
export interface ResolvedMicrosoftConfiguration extends MicrosoftConfiguration {
  method: "default" | "custom"; audience: Audience | null; authority: string;
  verification: "verified" | "manual" | "unverified";
  home_account_id: string | null; connected_email: string | null; display_name: string | null;
  last_verified_at?: string | null;
}
export function humanMicrosoftError(error: unknown) {
  const message = error instanceof Error ? error.message : "Microsoft connection failed.";
  if (/AADSTS50020|AADSTS50194|AADSTS700016/i.test(message)) return "This account or application is not supported by the selected Microsoft sign-in configuration. Refresh configuration; if detection is unavailable, check Supported account types in Entra. See Help → Troubleshooting.";
  if (/AADSTS50011/i.test(message)) return "The redirect URL does not match the Single-page application URL registered in Entra. Copy the exact URL from Help.";
  if (/popup|empty_window/i.test(message)) return "Allow popups for this website, then click Connect again.";
  if (/consent|admin(?:istrator)? approval|AADSTS65001|AADSTS65004|AADSTS90094/i.test(message)) return "Microsoft permission approval is required. Your organization may require its Microsoft administrator to approve access, even to your own mailbox. See Help → Microsoft permissions for the steps.";
  return message;
}
