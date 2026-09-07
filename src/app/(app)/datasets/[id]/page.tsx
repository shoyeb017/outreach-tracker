import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { DatasetWorkspace } from "@/components/datasets/dataset-workspace";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DatasetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) notFound();

  const [datasetResult, columnsResult, rowsResult, templatesResult, rulesResult, placeholderMappingsResult, routingResult, fieldsResult, integrationResult, preferencesResult, suppressionsResult, historyResult, runsResult] = await Promise.all([
    supabase.from("datasets").select("*").eq("id", id).maybeSingle(),
    supabase.from("dataset_columns").select("*").eq("dataset_id", id).order("display_order"),
    supabase.from("dataset_rows").select("*", { count: "exact" }).eq("dataset_id", id).order("row_number").range(0, 99),
    supabase.from("templates").select("*").eq("is_active", true).eq("is_archived", false).order("name"),
    supabase.from("routing_rules").select("*").eq("dataset_id", id),
    supabase.from("dataset_placeholder_mappings").select("*").eq("dataset_id", id),
    supabase.rpc("dataset_routing_values", { p_dataset_id: id }),
    supabase.from("signature_fields").select("*").order("display_order"),
    supabase.from("microsoft_integrations").select("*").maybeSingle(),
    supabase.from("user_preferences").select("*").maybeSingle(),
    supabase.from("suppression_list").select("email_normalized"),
    supabase.from("email_history").select("recipient_email,template_id,status").eq("dataset_id", id).in("status", ["sent", "simulated"]).limit(10000),
    supabase.from("send_runs").select("*,send_run_items(*)").eq("dataset_id", id).in("status", ["queued", "running", "paused"]).order("created_at", { ascending: false }),
  ]);

  if (!datasetResult.data) notFound();
  return (
    <main className="page-shell">
      <PageHeader eyebrow="Dataset" title={datasetResult.data.name} description={`${datasetResult.data.row_count.toLocaleString()} imported rows · ${datasetResult.data.source_file_name || "Imported data"}`} />
      <DatasetWorkspace
        dataset={datasetResult.data}
        columns={columnsResult.data ?? []}
        initialRows={rowsResult.data ?? []}
        rowCount={rowsResult.count ?? 0}
        templates={templatesResult.data ?? []}
        rules={rulesResult.data ?? []}
        placeholderMappings={placeholderMappingsResult.data ?? []}
        routingValues={routingResult.data ?? []}
        signatureFields={fieldsResult.data ?? []}
        integration={integrationResult.data}
        preferences={preferencesResult.data ?? {}}
        suppressions={(suppressionsResult.data ?? []).map((item) => item.email_normalized)}
        history={historyResult.data ?? []}
        unfinishedRuns={(runsResult.data ?? []) as never}
        initialTab={query.tab}
      />
    </main>
  );
}
