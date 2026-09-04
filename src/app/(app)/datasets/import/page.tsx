import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard, type MappingProfile } from "@/components/spreadsheet/import-wizard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function ImportPage() {
  const supabase = await getSupabaseServerClient();
  let templates = []; let mappingProfiles: MappingProfile[] = []; let keepOriginal = false;
  if (supabase) {
    const [templateResult, preferenceResult, mappingResult] = await Promise.all([
      supabase.from("templates").select("*").eq("is_active", true).eq("is_archived", false).order("is_system", { ascending: false }).order("name"),
      supabase.from("user_preferences").select("keep_original_file").maybeSingle(),
      supabase.from("column_mapping_profiles").select("id,name,mappings,routing_key_label,routing_rules,subject_strategy").order("name"),
    ]);
    templates = templateResult.data ?? []; mappingProfiles = mappingResult.data ?? []; keepOriginal = preferenceResult.data?.keep_original_file ?? false;
  }
  return <main className="page-shell"><PageHeader eyebrow="New dataset" title="Import a spreadsheet" description="Preview and configure everything before data is written to your workspace." /><ImportWizard templates={templates} mappingProfiles={mappingProfiles} keepOriginalDefault={keepOriginal} /></main>;
}
