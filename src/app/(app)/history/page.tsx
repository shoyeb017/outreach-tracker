import { Clock3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryTable } from "@/components/history/history-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createHistoryPreview } from "@/lib/ui-preview/history";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

export const dynamic = "force-dynamic";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const supabase = await getSupabaseServerClient();
  const demo = isUiTestMode() && !supabase && (await searchParams).demo === "1";
  const { data, error } = supabase ? await supabase.from("email_history").select("*,datasets(name),templates(name)").order("sent_at", { ascending: false }).limit(1000) : { data: demo ? createHistoryPreview() : [], error: null };
  if (error) throw new Error("Could not load email history.");
  return <main className="page-shell">
    <PageHeader eyebrow="Audit trail" title="Email history" description="Review saved emails and outcomes from your latest 1,000 history records. Search and filters apply to these records." />
    {demo && <p role="note" className="mb-6 rounded-2xl bg-[var(--info-soft)] p-5 text-sm text-[var(--info)]">Design preview only: all records below are fictional. No emails were sent and no data is saved.</p>}
    {data?.length ? <HistoryTable rows={data as never} readOnlyDemo={demo} /> : <EmptyState icon={Clock3} title="No email history yet" description="Simulated and live send results appear here with their final rendered content." />}
  </main>;
}
