import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard, type MappingProfile } from "@/components/spreadsheet/import-wizard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function ImportPage() {
  const supabase = await getSupabaseServerClient();
  let templates = []; let mappingProfiles: MappingProfile[] = [];
  if (supabase) {
    const [templateResult, mappingResult] = await Promise.all([
      supabase.from("templates").select("*").eq("is_active", true).eq("is_archived", false).order("is_system", { ascending: false }).order("name"),
      supabase.from("column_mapping_profiles").select("id,name,mappings,routing_key_label,routing_rules,subject_strategy").order("name"),
    ]);
    if (templateResult.error || mappingResult.error) throw new Error("Could not load spreadsheet setup. Please try again.");
    templates = templateResult.data ?? []; mappingProfiles = mappingResult.data ?? [];
  }
  return <main className="page-shell"><PageHeader eyebrow="Spreadsheets" title="New spreadsheet" description="Upload your file, choose the recipient email column, and set up your templates. No emails are sent here." /><ImportWizard templates={templates} mappingProfiles={mappingProfiles} /></main>;
}
