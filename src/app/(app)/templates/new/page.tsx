import { PageHeader } from "@/components/layout/page-header";
import { TemplateForm } from "@/components/templates/template-form";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewTemplatePage() {
  const supabase = await getSupabaseServerClient();
  const fields = supabase ? await supabase.from("signature_fields").select("*").order("display_order") : { data: [] };
  return <main className="page-shell"><PageHeader eyebrow="Template library" title="Create an email template" description="Write your message and check the sample preview. Then save it to use in a spreadsheet." /><TemplateForm signatureFields={fields.data ?? []} /></main>;
}
