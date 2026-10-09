"use client";

import { Archive, ArchiveRestore, Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function TemplateActions({ id, name, isSystem, archived, showOpen = true }: { id: string; name: string; isSystem: boolean; archived: boolean; showOpen?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggleArchive() {
    setPending(true);
    const { error } = await getSupabaseBrowserClient().from("templates").update({ is_archived: !archived, is_active: archived }).eq("id", id);
    setPending(false);
    if (error) toast.error(error.message);
    else { toast.success(archived ? "Template restored" : "Template archived"); router.refresh(); }
  }

  async function remove() {
    if (!window.confirm(`Delete "${name}"? Sent-email history keeps its rendered snapshots, but this template cannot be recovered.`)) return;
    setPending(true);
    const { error } = await getSupabaseBrowserClient().from("templates").delete().eq("id", id);
    setPending(false);
    if (error) toast.error(error.message);
    else { toast.success("Template deleted"); router.push("/templates"); router.refresh(); }
  }

  return <div className="flex flex-wrap gap-2">
    {showOpen && <ButtonLink href={`/templates/${id}`} variant="outline" size="sm">{isSystem ? <Eye size={14} /> : <Pencil size={14} />}{isSystem ? "View" : "Edit"}</ButtonLink>}
    {isSystem ? <ButtonLink href={`/templates/${id}?duplicate=1`} size="sm"><Copy size={14} />Make a copy</ButtonLink> : <details className="relative">
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold hover:bg-[var(--muted)]">More options</summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-44 flex-col items-stretch rounded-xl border bg-[var(--card)] p-2">
        <ButtonLink href={`/templates/${id}?duplicate=1`} variant="ghost" size="sm"><Copy size={14} />Make a copy</ButtonLink>
        <Button variant="ghost" size="sm" disabled={pending} onClick={toggleArchive}>{archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{archived ? "Restore" : "Archive"}</Button>
        <Button className="text-[var(--danger)] hover:bg-[var(--muted)] hover:text-[var(--danger)]" variant="ghost" size="sm" disabled={pending} onClick={remove}><Trash2 size={14} />Delete</Button>
      </div>
    </details>}
  </div>;
}
