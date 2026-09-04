import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplateForm } from "@/components/templates/template-form";
import { TemplateVersionHistory } from "@/components/templates/template-version-history";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicate?: string }> }) {
  const { id } = await params; const { duplicate } = await searchParams; const supabase = await getSupabaseServerClient();
  const [templateResult, versionsResult] = supabase ? await Promise.all([supabase.from("templates").select("*").eq("id", id).maybeSingle(), supabase.from("template_versions").select("*").eq("template_id", id).order("version_number", { ascending: false }).limit(20)]) : [{ data: null }, { data: [] }];
  if (!templateResult.data) notFound();
  const isDuplicate = duplicate === "1";
  const template = templateResult.data;
  return <main className="page-shell"><PageHeader eyebrow="Template library" title={isDuplicate ? `Duplicate ${template.name}` : template.is_system ? `View ${template.name}` : `Edit ${template.name}`} description={isDuplicate ? "Create a personal, editable copy of this template." : template.is_system ? "System templates are read-only. Duplicate this one to create an editable personal copy." : "Edit the message, publishing status, and placeholder behavior."} actions={<><Link href="/templates"><Button variant="outline"><ArrowLeft size={15} />Back to templates</Button></Link>{!isDuplicate && <TemplateActions id={template.id} name={template.name} isSystem={template.is_system} archived={template.is_archived} showOpen={false} />}</>} /><TemplateForm template={template} duplicate={isDuplicate} />{!isDuplicate && <TemplateVersionHistory templateId={id} versions={versionsResult.data ?? []} />}</main>;
}
