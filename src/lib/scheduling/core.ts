// Shared with the Supabase worker. No Next, browser-session, or Node imports.
export const SCHEDULE_LIMITS = { recipients: 100, active: 10, daysAhead: 30, minimumMinutes: 5, lateMinutes: 15, perTick: 5, perDay: 100 } as const;
export type ScheduleStatus = "scheduled" | "running" | "paused" | "reconnect_required" | "needs_attention" | "completed" | "completed_with_errors" | "cancelled";
export type ScheduledItemStatus = "pending" | "sending" | "accepted" | "simulated" | "failed" | "skipped" | "cancelled" | "uncertain";
export interface ScheduledBatch {
  id: string; dataset_id: string | null; kind?: "dataset" | "test"; dataset_name: string; send_run_id: string; user_id: string;
  scheduled_at: string; timezone: string; status: ScheduleStatus; live_enabled: boolean;
  sender_email: string | null; connection_id: string | null; duplicate_policy: string;
  reason: string | null; created_at: string; updated_at: string; completed_at: string | null;
}
export interface ScheduledItem {
  id: string; batch_id: string; user_id: string; send_run_item_id: string; dataset_row_id: string | null;
  recipient_email: string; template_id: string | null; template_name: string; subject: string;
  html_body: string; plain_text_body: string; status: ScheduledItemStatus; attempts: number;
  reason: string | null; next_attempt_at: string; accepted_at: string | null;
}
export const scheduleLabels: Record<ScheduleStatus | ScheduledItemStatus, string> = {
  scheduled: "Scheduled", running: "Sending", paused: "Paused", reconnect_required: "Reconnect required",
  needs_attention: "Needs attention", completed: "Completed", completed_with_errors: "Completed with issues",
  cancelled: "Cancelled", pending: "Pending", sending: "Sending", accepted: "Accepted by Microsoft",
  simulated: "Practice completed", failed: "Failed", skipped: "Skipped", uncertain: "Outcome unknown",
};
export function validScheduleTime(value: string, timezone: string, now = Date.now()) {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("Choose a valid timezone."); }
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at < now + SCHEDULE_LIMITS.minimumMinutes * 60000) throw new Error("Choose a time at least 5 minutes from now.");
  if (at > now + SCHEDULE_LIMITS.daysAhead * 86400000) throw new Error("Schedule up to 30 days ahead.");
  return new Date(at).toISOString();
}
export function formatScheduleTime(value: string, timezone: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
export function localDateTime(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function base64(bytes: Uint8Array) { return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")); }
function unbase64(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
export function randomSecret() { return base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
export async function pkceChallenge(verifier: string) { return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function encryptionKey(secret: string) {
  let bytes: Uint8Array;
  try { bytes = unbase64(secret); } catch { throw new Error("The scheduler encryption key is invalid. Ask the administrator to check setup."); }
  if (bytes.length !== 32) throw new Error("The scheduler needs a 32-byte base64 encryption key.");
  return crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(value: string, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) }, await encryptionKey(secret), new TextEncoder().encode(value));
  return `v1.${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function unseal(value: string, secret: string, context: string) {
  const [version, iv, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !encrypted || extra) throw new Error("Background credentials could not be read. Reconnect background access.");
  const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv) as BufferSource, additionalData: new TextEncoder().encode(context) }, await encryptionKey(secret), unbase64(encrypted) as BufferSource);
  return new TextDecoder().decode(result);
}
export function classifySendResponse(status: number): "accepted" | "retry" | "reconnect" | "failed" | "uncertain" {
  if (status === 202) return "accepted";
  if (status === 429) return "retry";
  if (status === 401) return "reconnect";
  if (status === 408 || status >= 500 || (status >= 200 && status < 300)) return "uncertain";
  return "failed";
}
