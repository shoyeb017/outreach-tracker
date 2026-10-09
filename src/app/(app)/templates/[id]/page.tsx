import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplateForm } from "@/components/templates/template-form";
import { TemplateVersionHistory } from "@/components/templates/template-version-history";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicate?: string }> }) {
  const { id } = await params; const { duplicate } = await searchParams; const supabase = await getSupabaseServerClient();
  const [templateResult, versionsResult] = supabase ? await Promise.all([supabase.from("templates").select("*").eq("id", id).maybeSingle(), supabase.from("template_versions").select("*").eq("template_id", id).order("version_number", { ascending: false }).limit(20)]) : [{ data: null, error: null }, { data: [] }];
  if (templateResult.error) throw new Error("Could not load this template. Please try again.");
  if (!templateResult.data) notFound();
  const fields = supabase ? await supabase.from("signature_fields").select("*").order("display_order") : { data: [] };
  const isDuplicate = duplicate === "1";
  const template = templateResult.data;
  return <main className="page-shell"><PageHeader eyebrow="Template library" title={isDuplicate ? `Make a copy of ${template.name}` : template.is_system ? `View ${template.name}` : `Edit ${template.name}`} description={isDuplicate ? "Create a personal, editable copy of this template." : template.is_system ? "Ready-made templates are read-only. Make a copy to customize this message." : "Update your message and check how it looks. Changes apply to future emails."} actions={!isDuplicate && !template.is_system ? <TemplateActions id={template.id} name={template.name} isSystem={false} archived={template.is_archived} showOpen={false} /> : undefined} /><TemplateForm key={`${template.id}:${template.updated_at}:${duplicate}`} template={template} duplicate={isDuplicate} signatureFields={fields.data ?? []} />{!isDuplicate && !template.is_system && <details className="mt-6 rounded-xl border bg-[var(--card)] p-4"><summary className="cursor-pointer text-sm font-semibold">Previous versions · restore an earlier message</summary><TemplateVersionHistory templateId={id} versions={versionsResult.data ?? []} /></details>}</main>;
}
