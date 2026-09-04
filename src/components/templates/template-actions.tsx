"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    {showOpen && <Link href={`/templates/${id}`}><Button variant="outline" size="sm">{isSystem ? <Eye size={14} /> : <Pencil size={14} />}{isSystem ? "View" : "Edit"}</Button></Link>}
    <Link href={`/templates/${id}?duplicate=1`}><Button variant={isSystem ? "default" : "ghost"} size="sm"><Copy size={14} />{isSystem ? "Duplicate to edit" : "Duplicate"}</Button></Link>
    {!isSystem && <Button variant="ghost" size="sm" disabled={pending} onClick={toggleArchive}>{archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{archived ? "Restore" : "Archive"}</Button>}
    {!isSystem && <Button className="text-[#9b241c] hover:bg-[#fde8e6] hover:text-[#9b241c]" variant="ghost" size="sm" disabled={pending} onClick={remove}><Trash2 size={14} />Delete</Button>}
  </div>;
}
