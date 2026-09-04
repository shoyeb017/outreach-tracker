import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateLibrary } from "@/components/templates/template-library";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: templates } = supabase
    ? await supabase.from("templates").select("id,name,description,category,is_system,is_active,is_archived,updated_at,template_versions(count)").order("is_archived").order("is_system", { ascending: false }).order("name")
    : { data: [] };

  return <main className="page-shell">
    <PageHeader eyebrow="Content" title="Template library" description="Create, understand, and manage reusable emails in one place." actions={<Link href="/templates/new"><Button><Plus size={15} />Create personal template</Button></Link>} />
    {templates?.length
      ? <TemplateLibrary templates={templates} />
      : <EmptyState icon={Mail} title="No templates yet" description="Create a reusable email, then insert spreadsheet or sender placeholders as you write." action={<Link href="/templates/new"><Button><Plus size={15} />Create template</Button></Link>} />}
  </main>;
}
