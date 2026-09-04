import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Mail, Plus, Send, ShieldBan } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let datasets: Record<string, unknown>[] = []; let unfinished: Record<string, unknown>[] = [];
  const counts = { datasets: 0, rows: 0, templates: 0, sent: 0, failed: 0, suppressed: 0 };
  if (supabase && user) {
    const [datasetResult, templateResult, historyResult, failedResult, suppressionResult, recentResult, runResult] = await Promise.all([
      supabase.from("datasets").select("row_count", { count: "exact" }),
      supabase.from("templates").select("id", { count: "exact", head: true }).eq("is_active", true).eq("is_archived", false),
      supabase.from("email_history").select("id", { count: "exact", head: true }).eq("status", "sent"),
      supabase.from("email_history").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("suppression_list").select("id", { count: "exact", head: true }),
      supabase.from("datasets").select("id,name,source_file_name,row_count,valid_email_count,created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("send_runs").select("id,dataset_id,status,selected_count,sent_count,failed_count,skipped_count,created_at,datasets(name)").in("status", ["queued", "running", "paused"]).order("created_at", { ascending: false }).limit(5),
    ]);
    counts.datasets = datasetResult.count ?? 0; counts.rows = (datasetResult.data ?? []).reduce((sum, item) => sum + item.row_count, 0); counts.templates = templateResult.count ?? 0; counts.sent = historyResult.count ?? 0; counts.failed = failedResult.count ?? 0; counts.suppressed = suppressionResult.count ?? 0;
    datasets = recentResult.data ?? []; unfinished = runResult.data ?? [];
  }
  return <main className="page-shell"><PageHeader eyebrow="Workspace overview" title="Your sending workspace" description="Move from clean data to confidently sent messages. Test mode remains on until you explicitly enable live sending." actions={<Link href="/datasets/import"><Button><Plus size={15} />Import spreadsheet</Button></Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Datasets" value={counts.datasets} detail={`${counts.rows.toLocaleString()} rows in recent datasets`} icon={Database} /><StatCard label="Active templates" value={counts.templates} detail="System and personal" icon={Mail} tone="blue" /><StatCard label="Emails sent" value={counts.sent.toLocaleString()} detail="Successful live sends" icon={CheckCircle2} /><StatCard label="Needs attention" value={counts.failed} detail={`${counts.suppressed} suppressed addresses`} icon={AlertTriangle} tone={counts.failed ? "red" : "amber"} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Recent datasets</CardTitle><Link href="/datasets" className="text-xs font-semibold text-[#176b55]">View all</Link></CardHeader><CardContent className="p-0">{datasets.length ? <div className="divide-y">{datasets.map((dataset) => <Link href={`/datasets/${dataset.id}`} key={String(dataset.id)} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 transition hover:bg-[#fafcfb]"><div className="min-w-0"><div className="truncate text-sm font-semibold">{String(dataset.name)}</div><div className="mt-1 truncate text-xs text-[#7a8581]">{String(dataset.source_file_name || "Imported data")} · {formatDate(String(dataset.created_at))}</div></div><div className="text-right"><div className="text-sm font-semibold">{Number(dataset.row_count).toLocaleString()}</div><div className="text-[11px] text-[#7a8581]">{Number(dataset.valid_email_count).toLocaleString()} ready</div></div></Link>)}</div> : <div className="grid min-h-60 place-items-center px-6 text-center"><div><FileSpreadsheet className="mx-auto text-[#8aa69c]" /><h3 className="mt-3 text-sm font-semibold">No datasets yet</h3><p className="mt-1 text-xs text-[#7a8581]">Import an Excel or CSV file to begin.</p></div></div>}</CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle>Unfinished sends</CardTitle></CardHeader><CardContent>{unfinished.length ? <div className="space-y-3">{unfinished.map((run) => <Link key={String(run.id)} href={`/datasets/${run.dataset_id}?tab=send&run=${run.id}`} className="block rounded-lg border p-3 hover:bg-[#fafcfb]"><div className="flex justify-between"><span className="text-sm font-semibold">{String((run.datasets as { name?: string } | null)?.name ?? "Send session")}</span><Badge tone="warning">{String(run.status)}</Badge></div><div className="mt-2 text-xs text-[#7a8581]">{Number(run.sent_count) + Number(run.failed_count) + Number(run.skipped_count)} of {Number(run.selected_count)} processed</div></Link>)}</div> : <div className="py-7 text-center"><Send className="mx-auto text-[#9cacA6]" size={22} /><p className="mt-2 text-sm font-medium">Nothing waiting to resume</p></div>}</CardContent></Card><Card><CardHeader><CardTitle>Safety status</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-3 text-sm"><ShieldBan size={17} className="text-[#176b55]" /><span>Live sending defaults to off</span></div><div className="flex items-center gap-3 text-sm"><CheckCircle2 size={17} className="text-[#176b55]" /><span>Duplicate checks enabled by default</span></div></CardContent></Card></div></div></main>;
}
