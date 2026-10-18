import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySendResponse, SCHEDULE_LIMITS, seal, unseal, type ScheduledBatch, type ScheduledItem } from "./core.ts";

type Connection = { id: string; user_id: string; client_id: string; authority: string; sender_email: string; microsoft_user_id: string; status: string; refresh_ciphertext: string; credential_ciphertext: string };
class AuthorizationFailure extends Error {}
class TemporaryFailure extends Error {}
class EngagementPreparationFailure extends Error {}
function checked<T>(result: { data: T; error: unknown }): T { if (result.error) throw new Error("The scheduler could not save or verify progress."); return result.data; }
const authorityPattern = /^https:\/\/login\.microsoftonline\.com\/(common|organizations|consumers|[0-9a-f-]{36})$/i;
export async function workerAuthorized(request: Request, expected: string) {
  if (expected.length < 32) return false;
  const actual = request.headers.get("authorization") ?? "";
  if (actual.length > 600) return false;
  const hashes = await Promise.all([actual, `Bearer ${expected}`].map(async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))));
  let difference = 0; for (let i = 0; i < hashes[0].length; i++) difference |= hashes[0][i] ^ hashes[1][i];
  return difference === 0;
}
async function accessToken(database: SupabaseClient, connection: Connection, key: string, fetcher: typeof fetch) {
  if (!authorityPattern.test(connection.authority) || !/^[0-9a-f-]{36}$/i.test(connection.client_id) || connection.status !== "connected") throw new AuthorizationFailure("Enable background access again.");
  let refresh: string; let credential: string;
  try { refresh = await unseal(connection.refresh_ciphertext, key, `${connection.user_id}:refresh`); credential = await unseal(connection.credential_ciphertext, key, `${connection.user_id}:credential`); }
  catch { throw new AuthorizationFailure("Background credentials could not be read. Ask the administrator to check the encryption key, then reconnect."); }
  let response: Response;
  try { response = await fetcher(`${connection.authority}/oauth2/v2.0/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: connection.client_id, client_secret: credential, refresh_token: refresh, scope: "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send offline_access" }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) }); }
  catch { throw new TemporaryFailure("Microsoft authorization is temporarily unavailable. No email was attempted."); }
  if (response.status === 429 || response.status >= 500) throw new TemporaryFailure("Microsoft authorization is temporarily unavailable. No email was attempted.");
  if (!response.ok) throw new AuthorizationFailure("Microsoft could not renew background access. Reconnect; if this continues, ask the administrator to check the client secret and consent.");
  const token = await response.json();
  if (!token.access_token || !String(token.scope ?? "").split(" ").some((scope) => /(?:^|\/)mail.send$/i.test(scope))) throw new AuthorizationFailure("Background Mail.Send access was not granted. Reconnect and approve sending.");
  // Persist a rotated refresh token BEFORE any email attempt, using the generation as CAS.
  if (token.refresh_token) {
    const saved = checked(await database.from("background_mail_connections").update({ refresh_ciphertext: await seal(token.refresh_token, key, `${connection.user_id}:refresh`), updated_at: new Date().toISOString() }).eq("id", connection.id).eq("status", "connected").select("id").maybeSingle());
    if (!saved) throw new AuthorizationFailure("The background connection changed. Review and reconnect.");
  }
  let profileResponse: Response;
  try { profileResponse = await fetcher("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }); }
  catch { throw new TemporaryFailure("Microsoft mailbox verification is temporarily unavailable. No email was attempted."); }
  if (profileResponse.status === 429 || profileResponse.status >= 500) throw new TemporaryFailure("Microsoft mailbox verification is temporarily unavailable. No email was attempted.");
  if (!profileResponse.ok) throw new AuthorizationFailure("Microsoft could not verify this mailbox. Reconnect or ask your administrator to check access.");
  const profile = await profileResponse.json();
  if (profile.id !== connection.microsoft_user_id || ![profile.mail, profile.userPrincipalName].some((value) => typeof value === "string" && value.toLowerCase() === connection.sender_email.toLowerCase())) throw new AuthorizationFailure("The Microsoft mailbox no longer matches the approved sender. Nothing was sent.");
  return token.access_token as string;
}

export async function runScheduledWorker(database: SupabaseClient, key: string, fetcher: typeof fetch = fetch) {
  const lease = crypto.randomUUID(); const started = Date.now(); let processed = 0;
  if (!checked(await database.rpc("scheduler_begin_tick", { p_lease: lease }))) return { status: "busy", processed };
  const tokens = new Map<string, string>();
  try {
    for (let count = 0; count < SCHEDULE_LIMITS.perTick && Date.now() - started < 75000; count++) {
      const next = checked(await database.rpc("scheduler_next_item", { p_lease: lease })) as { batch: ScheduledBatch; item: ScheduledItem } | null;
      if (!next) break;
      const { batch, item } = next; let token = "";
      if (batch.live_enabled) {
        try {
          const connection = checked(await database.from("background_mail_connections").select("*").eq("id", batch.connection_id).eq("user_id", batch.user_id).maybeSingle()) as Connection | null;
          if (!connection) throw new AuthorizationFailure("Enable background Microsoft access again.");
          token = tokens.get(connection.id) ?? await accessToken(database, connection, key, fetcher);
          tokens.set(connection.id, token);
        } catch (error) {
          checked(await database.rpc("scheduler_hold_batch", { p_batch: batch.id, p_lease: lease, p_status: error instanceof AuthorizationFailure ? "reconnect_required" : "retry", p_reason: error instanceof AuthorizationFailure || error instanceof TemporaryFailure ? error.message : "Background safety checks are temporarily unavailable. No email was attempted." }));
          continue;
        }
      }
      if (Date.now() - started > 85000) break;
      if (!checked(await database.rpc("scheduler_arm_item", { p_item: item.id, p_lease: lease, p_engagement_capable: true }))) continue;
      let status: "accepted" | "simulated" | "failed" | "uncertain" | "pending" = "simulated";
      let reason: string | null = null; let retry = 60; let hold: "reconnect_required" | "needs_attention" | undefined;
      let htmlBody = item.html_body;
      if (batch.live_enabled && item.engagement_snapshot?.enabled) {
        try {
          const result = await database.rpc("engagement_prepare_send", { p_item: item.send_run_item_id, p_origin: item.engagement_snapshot.origin ?? "" });
          if (result.error) throw new EngagementPreparationFailure(result.error.code === "P0001" ? result.error.message : "Check engagement setup and storage limits.");
          const tracked = result.data;
          if (!tracked?.htmlBody) throw new Error("Missing tracked message.");
          htmlBody = tracked.htmlBody;
        } catch (error) {
          const detail = error instanceof EngagementPreparationFailure ? error.message : "Check engagement setup and storage limits.";
          checked(await database.rpc("scheduler_finish_item", { p_item: item.id, p_lease: lease, p_status: "failed", p_reason: `No Microsoft send was attempted. Engagement preparation failed: ${detail}`, p_retry_seconds: 60 }));
          checked(await database.rpc("scheduler_hold_batch", { p_batch: batch.id, p_lease: lease, p_status: "needs_attention", p_reason: `Engagement preparation failed before sending: ${detail}` }));
          processed++; continue;
        }
      }
      if (batch.live_enabled) {
        try {
          const response = await fetcher("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "client-request-id": item.id }, body: JSON.stringify({ message: { subject: item.subject, body: { contentType: "HTML", content: htmlBody }, toRecipients: [{ emailAddress: { address: item.recipient_email } }] }, saveToSentItems: true }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
          const outcome = classifySendResponse(response.status);
          if (outcome === "accepted") status = "accepted";
          else if (outcome === "retry") {
            status = item.attempts >= 2 ? "failed" : "pending";
            retry = Math.max(60, Math.min(3600, Number(response.headers.get("retry-after")) || (item.attempts + 1) * 120));
            reason = status === "failed" ? "Microsoft throttled all 3 attempts. Not retried further." : `Microsoft throttled this request before accepting it. Retry in at least ${retry} seconds.`;
          } else if (outcome === "reconnect") { status = "pending"; hold = "reconnect_required"; reason = "Microsoft access expired or was revoked. Reconnect and choose a new send time."; }
          else if (outcome === "uncertain") { status = "uncertain"; reason = "Microsoft returned an ambiguous result. Check Sent Items. Never automatically retry this email."; }
          else { status = "failed"; reason = response.status === 403 ? "Microsoft refused sending (HTTP 403). Ask your Microsoft administrator to check delegated Mail.Send consent and mailbox sending policies. No automatic retry was made." : `Microsoft rejected this email (HTTP ${response.status}). Check the recipient and saved message; ask your Microsoft administrator to check mailbox availability if this continues. No automatic retry was made.`; if (response.status === 403) hold = "needs_attention"; }
        } catch { status = "uncertain"; reason = "The connection stopped after the send attempt began. Check Microsoft Sent Items; this email will not be automatically resent."; }
      }
      const saved = checked(await database.rpc("scheduler_finish_item", { p_item: item.id, p_lease: lease, p_status: status, p_reason: reason, p_retry_seconds: retry }));
      if (!saved) throw new Error("The send outcome could not be saved. Do not retry automatically.");
      processed++;
      if (hold) checked(await database.rpc("scheduler_hold_batch", { p_batch: batch.id, p_lease: lease, p_status: hold, p_reason: reason ?? "Microsoft access needs attention." }));
      // Sequential sending; never launch a burst of parallel Graph requests.
      if (batch.live_enabled) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    checked(await database.rpc("scheduler_refresh_counts"));
    return { status: "ok", processed };
  } finally {
    // If this fails or the worker is killed, the lease expires and stale 'sending'
    // items become uncertain. They must never be reset to pending automatically.
    await database.from("scheduled_mail_control").update({ lease_until: null }).eq("id", true).eq("lease_id", lease);
  }
}
