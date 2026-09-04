import { Clock3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryTable } from "@/components/history/history-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function HistoryPage() { const supabase = await getSupabaseServerClient(); const { data } = supabase ? await supabase.from("email_history").select("*,datasets(name),templates(name)").order("sent_at", { ascending: false }).limit(1000) : { data: [] }; return <main className="page-shell"><PageHeader eyebrow="Audit trail" title="Email history" description="Review the exact subject and rendered body saved for every sent, simulated, failed, or skipped message." />{data?.length ? <HistoryTable rows={data as never} /> : <EmptyState icon={Clock3} title="No email history yet" description="Simulated and live send results appear here with their final rendered content." />}</main>; }
