"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface Version { id: string; version_number: number; name: string; description: string | null; category: string | null; subject_template: string; html_body: string; plain_text_body: string | null; signature_behavior: string; created_at: string }
export function TemplateVersionHistory({ templateId, versions }: { templateId: string; versions: Version[] }) {
  const router = useRouter();
  async function restore(version: Version) { if (!window.confirm(`Restore version ${version.version_number}? The current version will remain in history.`)) return; const { error } = await getSupabaseBrowserClient().from("templates").update({ name: version.name, description: version.description, category: version.category, subject_template: version.subject_template, html_body: version.html_body, plain_text_body: version.plain_text_body, signature_behavior: version.signature_behavior }).eq("id", templateId); if (error) toast.error(error.message); else { toast.success("Previous version restored"); router.refresh(); } }
  return <Card className="mt-6"><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent>{versions.length ? <div className="divide-y">{versions.map((version) => <div className="flex items-center justify-between gap-4 py-3" key={version.id}><div><div className="text-sm font-semibold">Version {version.version_number}</div><div className="mt-1 text-xs text-[#7a8581]">{formatDate(version.created_at)} · {version.subject_template}</div></div><Button variant="outline" size="sm" onClick={() => restore(version)}><RotateCcw size={13} />Restore</Button></div>)}</div> : <p className="text-sm text-[#7a8581]">Versions appear after meaningful edits to subject or body content.</p>}</CardContent></Card>;
}
