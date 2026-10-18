import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow } from "@/components/history/history-table";

// List metadata only; full email bodies are loaded when a preview is opened.
export const HISTORY_FIELDS = "id,dataset_id,dataset_row_id,send_run_id,template_id,recipient_email,recipient_name,company_name,subject,sender_microsoft_email,status,error_message,sent_at,is_test";

export function historyLoadError(code?: string) {
  if (code === "42501") return "Your account cannot access email history. Ask the administrator to check database permissions and workspace access.";
  if (code === "42P01" || code === "42703" || code?.startsWith("PGRST2")) return "Email history needs a database update. Ask the administrator to check the Supabase migrations and reload the API schema.";
  if (code === "57014") return "Loading email history took too long. Please refresh and try again.";
  return "Email history could not be loaded. Refresh to try again. If this continues, ask the administrator to check the Supabase connection and database access.";
}

export async function loadHistory(client: SupabaseClient) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { rows: [], error: authError && authError.status !== 401 && authError.status !== 403 ? historyLoadError() : "Your session has expired. Sign in again to view email history." };
  const owner = auth.user.id;
  const result = await client.from("email_history").select(HISTORY_FIELDS).eq("user_id", owner).order("sent_at", { ascending: false }).order("id").limit(1000);
  if (result.error) {
    console.error("Email history list failed", { code: result.error.code });
    return { rows: [], error: historyLoadError(result.error.code) };
  }
  const records = result.data ?? [];
  if (!records.length) return { rows: [] as HistoryRow[] };
  const ids = (field: "dataset_id" | "template_id" | "send_run_id") => [...new Set(records.map(row => row[field]).filter(Boolean))];
  async function lookup(table: string, fields: string, values: string[], owned = true) {
    const data: { id: string; name?: string; scheduled_batch_id?: string | null }[] = [];
    let error = false;
    // Bound URL length; a thousand UUIDs in one .in() request can exceed proxy limits.
    for (let offset = 0; offset < values.length; offset += 100) {
      let query = client.from(table).select(fields).in("id", values.slice(offset, offset + 100));
      if (owned) query = query.eq("user_id", owner);
      const result = await query;
      if (result.error) error = true;
      else data.push(...(result.data as unknown as typeof data ?? []));
    }
    return { data, error };
  }
  // Independent lookups avoid fragile embedded relationships. Missing labels do not hide results.
  const [datasets, templates, runs] = await Promise.all([
    lookup("datasets", "id,name", ids("dataset_id")),
    lookup("templates", "id,name", ids("template_id"), false),
    lookup("send_runs", "id,scheduled_batch_id", ids("send_run_id")),
  ]);
  const datasetNames = new Map(datasets.data?.map(row => [row.id, row.name]));
  const templateNames = new Map(templates.data?.map(row => [row.id, row.name]));
  const runSources = new Map(runs.data?.map(row => [row.id, row.scheduled_batch_id]));
  const rows: HistoryRow[] = records.map(row => ({ ...row, final_html_body: "", final_plain_text_body: null, body_loaded: false,
    datasets: datasetNames.has(row.dataset_id) ? { name: datasetNames.get(row.dataset_id)! } : null,
    templates: templateNames.has(row.template_id) ? { name: templateNames.get(row.template_id)! } : null,
    sending_method: runs.error ? "unknown" : runSources.get(row.send_run_id) ? "scheduled" : "manual",
  }));
  return { rows, warning: datasets.error || templates.error || runs.error ? "Email results are loaded, but some spreadsheet, template or scheduling labels are unavailable. Refresh to retry." : undefined };
}
