import "server-only";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin, limitRequest, privilegedDatabase } from "@/lib/admin/server";
import { prepareRowEmail } from "@/lib/email/render";
import { checkEmailReadiness } from "@/lib/email/readiness";
import { digest, SCHEDULE_LIMITS } from "./core";
import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, DatasetRow, EmailTemplate, RoutingRule, SignatureField } from "@/types";

export const selectionInput = z.object({ datasetId: z.string().uuid(), rowIds: z.array(z.string().uuid()).min(1).max(SCHEDULE_LIMITS.recipients), duplicatePolicy: z.enum(["block_template_recipient", "warn", "allow"]).default("block_template_recipient") });
export async function scheduleUser(request?: Request) {
  if (request) assertSameOrigin(request);
  const client = await getSupabaseServerClient();
  if (!client) throw new Error("Sign in to manage scheduled emails.");
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Sign in again to manage scheduled emails.");
  const access = await client.rpc("workspace_access_allowed");
  if (access.error || !access.data) throw new Error("Workspace access could not be verified. Try again or contact the administrator.");
  if (request) await limitRequest(`scheduling:${user.id}`, 20);
  return { user, client, database: privilegedDatabase() };
}
export function schedulingFailure(error: unknown) {
  return Response.json({ error: error instanceof z.ZodError ? "Check your selection and schedule details. Choose up to 100 recipients." : error instanceof Error ? error.message : "Scheduled emails could not be loaded." }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
export function checked<T>(result: { data: T; error: unknown }, message = "Scheduled-email data is unavailable. Apply the scheduled-mail migration and check server access."): T {
  if (result.error) {
    const error = result.error as { code?: string; message?: string };
    throw new Error(error.code === "P0001" && error.message ? error.message : message);
  }
  return result.data;
}
export async function smallJson(request: Request) {
  const text = await request.text();
  if (text.length > 20000) throw new Error("This request is too large. Choose up to 100 recipients.");
  try { return JSON.parse(text); } catch { throw new Error("The request was not valid. Refresh and try again."); }
}
export async function schedulerHealth(database: ReturnType<typeof privilegedDatabase>) {
  const row = checked(await database.from("scheduled_mail_control").select("enabled,last_tick_at").eq("id", true).single());
  if (!row) throw new Error("Scheduled sending has not been configured. Apply the scheduled-mail migration.");
  return { enabled: row.enabled === true, lastTickAt: row.last_tick_at as string | null, healthy: !!row.last_tick_at && Date.parse(row.last_tick_at) > Date.now() - 300000 };
}
export async function backgroundStatus(context: Awaited<ReturnType<typeof scheduleUser>>) {
  const { database, user } = context;
  const integration = checked(await database.from("microsoft_integrations").select("configuration_id,configuration_version,connection_method,client_id,connected_email,connection_status").eq("user_id", user.id).maybeSingle());
  const saved = checked(await database.from("background_mail_connections").select("id,status,sender_email,configuration_id,configuration_version,reason,updated_at").eq("user_id", user.id).maybeSingle());
  const connected = saved?.status === "connected" && integration?.connection_status === "connected" && saved.configuration_id === integration.configuration_id && saved.configuration_version === integration.configuration_version && saved.sender_email?.toLowerCase() === integration.connected_email?.toLowerCase();
  return { connected, status: connected ? "connected" : saved?.status ?? "disconnected", senderEmail: integration?.connected_email ?? null, reason: saved?.reason ?? null, updatedAt: saved?.updated_at ?? null,
    microsoftConnected: integration?.connection_status === "connected", custom: integration?.connection_method === "custom",
    setupReady: !!process.env.SCHEDULE_ENCRYPTION_KEY && (integration?.connection_method === "custom" || (!!process.env.MICROSOFT_SCHEDULER_CLIENT_SECRET && integration?.client_id?.toLowerCase() === process.env.MICROSOFT_SCHEDULER_CLIENT_ID?.toLowerCase())) };
}
export async function prepareSchedule(context: Awaited<ReturnType<typeof scheduleUser>>, input: z.infer<typeof selectionInput>) {
  const { database, client, user } = context;
  const ids = [...new Set(input.rowIds)];
  const [d, rowsResult, cols, mappings, rulesResult, signatures, templateResult, preferences, integration] = await Promise.all([
    database.from("datasets").select("*").eq("id", input.datasetId).eq("user_id", user.id).single(),
    database.from("dataset_rows").select("*").eq("dataset_id", input.datasetId).eq("user_id", user.id).in("id", ids).order("row_number"),
    database.from("dataset_columns").select("*").eq("dataset_id", input.datasetId).eq("user_id", user.id),
    database.from("dataset_placeholder_mappings").select("*").eq("dataset_id", input.datasetId).eq("user_id", user.id),
    database.from("routing_rules").select("*").eq("dataset_id", input.datasetId).eq("user_id", user.id),
    database.from("signature_fields").select("*").eq("user_id", user.id).order("display_order"),
    database.from("templates").select("*").eq("is_active", true).eq("is_archived", false).or(`is_system.eq.true,user_id.eq.${user.id}`),
    database.from("user_preferences").select("live_sending_enabled").eq("user_id", user.id).maybeSingle(),
    database.from("microsoft_integrations").select("connected_email").eq("user_id", user.id).maybeSingle(),
  ]);
  const dataset = checked(d, "This spreadsheet is not available.") as Dataset;
  const rows = checked(rowsResult) as DatasetRow[];
  if (rows.length !== ids.length) throw new Error("Some selected rows were deleted or changed. Select your recipients again.");
  const columns = checked(cols) as DatasetColumn[]; const placeholderMappings = checked(mappings) as DatasetPlaceholderMapping[];
  const templates = checked(templateResult) as EmailTemplate[]; const rules = checked(rulesResult) as RoutingRule[];
  const signatureFields = checked(signatures) as SignatureField[];
  const live = checked(preferences)?.live_sending_enabled === true;
  const senderEmail = checked(integration)?.connected_email ?? null;
  const protection = checked(await client.rpc("send_recipient_protection", { p_emails: [...new Set(rows.map((row) => row.recipient_email?.trim().toLowerCase()).filter(Boolean))] }), "Recipient safety checks are unavailable. Nothing has been scheduled.");
  if (!protection) throw new Error("Recipient safety checks are unavailable.");
  const batchItems: { recipient_email: string; template_id: string }[] = [];
  const mapped = new Set(placeholderMappings.map((mapping) => mapping.placeholder));
  const items = rows.map((row) => {
    const email = prepareRowEmail({ row, dataset, columns, placeholderMappings, templates, rules, signatureFields });
    const readiness = checkEmailReadiness({ row, email, mapped, policy: input.duplicatePolicy, batchItems, history: protection.history ?? [], suppressions: protection.suppressed ?? [], uncertain: protection.uncertain ?? [], scheduled: protection.scheduled ?? [] });
    if (readiness.status === "ready" && email.template) batchItems.push({ recipient_email: row.recipient_email!, template_id: email.template.id });
    return { row_id: row.id, row_number: row.row_number, recipient_email: row.recipient_email?.trim() ?? "", template_id: email.template?.id ?? "", template_name: email.template?.name ?? "Not resolved", subject: email.subject, html_body: email.htmlBody, plain_text_body: email.plainTextBody, ...readiness };
  });
  const ready = items.filter((item) => item.status === "ready");
  if (new TextEncoder().encode(JSON.stringify(ready)).byteLength > 1000000) throw new Error("These email snapshots exceed the 1 MB schedule limit. Choose fewer recipients.");
  const hash = await digest(JSON.stringify({ datasetId: input.datasetId, live, senderEmail, policy: input.duplicatePolicy, items }));
  return { datasetName: dataset.name, live, senderEmail, items, hash, readyCount: ready.length, blockedCount: items.length - ready.length };
}
