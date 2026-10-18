import { Clock3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryTable } from "@/components/history/history-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createHistoryPreview } from "@/lib/ui-preview/history";
import { isUiTestMode } from "@/lib/config/ui-test-mode";
import { historyLoadError, loadHistory } from "@/lib/history/server";
import type { HistoryRow } from "@/components/history/history-table";

export const dynamic = "force-dynamic";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const supabase = await getSupabaseServerClient();
  const demo = isUiTestMode() && !supabase && (await searchParams).demo === "1";
  let result: { rows: HistoryRow[]; error?: string; warning?: string } = { rows: demo ? createHistoryPreview() : [] };
  try { if (supabase) result = await loadHistory(supabase); }
  catch { result = { rows: [], error: historyLoadError() }; }
  return <main className="page-shell">
    <PageHeader eyebrow="Audit trail" title="Email history" description="Review send-now and scheduled email results, then select recipients for a follow-up. Search and filters cover your latest 1,000 records." />
    <p className="mb-5 text-sm leading-6 text-[var(--muted-foreground)]">Scheduled sends appear here when a result is saved. Future, pending and unconfirmed schedules are in <a href="/scheduled" className="text-[var(--primary)] underline">Scheduled mail</a>. This is campaign history, not your full Microsoft Sent folder.</p>
    {result.error && <div role="alert" className="mb-6 space-y-3 rounded-md border bg-[var(--danger-soft)] p-5 text-sm"><p>{result.error}</p><a href="/history" className="ui-button focus-ring inline-flex min-h-10 items-center rounded-lg border border-[var(--input-border)] px-4 py-2 font-semibold text-[var(--primary)]">Retry email history</a></div>}
    {result.warning && <p role="status" className="mb-5 rounded-md border p-4 text-sm">{result.warning}</p>}
    {demo && <p role="note" className="mb-6 rounded-2xl bg-[var(--info-soft)] p-5 text-sm text-[var(--info)]">Design preview only: all records below are fictional. No emails were sent and no data is saved.</p>}
    {!result.error && (result.rows.length ? <HistoryTable rows={result.rows} readOnlyDemo={demo} /> : <EmptyState icon={Clock3} title="No email history yet" description="Send-now and scheduled campaign results appear here after processing, including practice and test results." />)}
  </main>;
}
