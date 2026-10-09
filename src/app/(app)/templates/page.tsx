import { Mail, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateLibrary } from "@/components/templates/template-library";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: templates, error } = supabase
    ? await supabase.from("templates").select("id,name,description,category,subject_template,html_body,is_system,is_active,is_archived,updated_at,template_versions(count)").order("is_archived").order("is_system", { ascending: false }).order("name")
    : { data: [], error: null };
  if (error) throw new Error("Could not load your email templates. Please try again.");

  return <main className="page-shell">
    <PageHeader eyebrow="Emails" title="Template library" description="Find a reusable message, customize it, and choose it for your spreadsheet." />
    {templates?.length
      ? <TemplateLibrary templates={templates} />
      : <EmptyState icon={Mail} title="Write your first email template" description="Save an email you can reuse. Add personal fields to give each recipient their own message." action={<ButtonLink href="/templates/new"><Plus size={15} />Create template</ButtonLink>} />}
  </main>;
}
