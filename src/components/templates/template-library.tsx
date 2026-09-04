"use client";

import { useMemo, useState } from "react";
import { Braces, FilePenLine, LockKeyhole, Route, Search } from "lucide-react";
import { TemplateActions } from "@/components/templates/template-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type TemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_system: boolean;
  is_active: boolean;
  is_archived: boolean;
  updated_at: string;
  template_versions: { count: number }[] | null;
};

type Filter = "all" | "personal" | "system" | "archived";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "personal", label: "Personal" },
  { value: "system", label: "System" },
  { value: "archived", label: "Archived" },
];

export function TemplateLibrary({ templates }: { templates: TemplateListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesFilter = filter === "all"
        || (filter === "personal" && !template.is_system)
        || (filter === "system" && template.is_system)
        || (filter === "archived" && template.is_archived);
      const matchesQuery = !normalizedQuery || [template.name, template.description, template.category]
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, templates]);

  return <div className="space-y-6">
    <Card className="overflow-hidden border-[#cfe2da] bg-[#f5faf8]">
      <CardHeader><CardTitle>How templates work</CardTitle><p className="mt-1 text-sm text-[#5f6f69]">A template is a reusable email. Placeholders are replaced with spreadsheet or sender values when you prepare a send.</p></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#176b55] shadow-sm"><FilePenLine size={17} /></span><div><div className="text-sm font-semibold">1. Write the message</div><p className="mt-1 text-xs leading-5 text-[#68736f]">Set the subject, formatted body, category, and signature behavior.</p></div></div>
        <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#176b55] shadow-sm"><Braces size={17} /></span><div><div className="text-sm font-semibold">2. Add placeholders</div><p className="mt-1 text-xs leading-5 text-[#68736f]">Insert values such as <code>{"{{first_name}}"}</code> or any imported column.</p></div></div>
        <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#176b55] shadow-sm"><Route size={17} /></span><div><div className="text-sm font-semibold">3. Route and preview</div><p className="mt-1 text-xs leading-5 text-[#68736f]">Assign templates to dataset rows, then verify resolved content before sending.</p></div></div>
      </CardContent>
      <div className="flex flex-col gap-2 border-t border-[#dceae4] px-5 py-3 text-xs text-[#5f6f69] sm:flex-row sm:items-center sm:justify-between"><span><strong>Personal:</strong> editable, duplicable, archivable, and deletable.</span><span className="flex items-center gap-1.5"><LockKeyhole size={13} /><strong>System:</strong> read-only; duplicate it to customize.</span></div>
    </Card>

    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8581]" size={16} /><Input className="pl-9" aria-label="Search templates" placeholder="Search by name, description, or category" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="flex flex-wrap gap-2" aria-label="Filter templates">{filters.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? "secondary" : "ghost"} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
      </CardContent>
    </Card>

    {visible.length ? <div className="grid gap-4 2xl:grid-cols-2">{visible.map((template) => {
      const versionCount = template.template_versions?.[0]?.count ?? 0;
      return <Card key={template.id} className="flex min-h-64 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0"><CardTitle className="truncate">{template.name}</CardTitle><p className="mt-1 text-xs text-[#7a8581]">Updated {formatDate(template.updated_at)}</p></div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5"><Badge tone={template.is_system ? "info" : "neutral"}>{template.is_system ? "System" : "Personal"}</Badge><Badge tone={template.is_archived ? "neutral" : template.is_active ? "success" : "warning"}>{template.is_archived ? "Archived" : template.is_active ? "Active" : "Inactive"}</Badge></div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <p className="min-h-10 text-sm leading-5 text-[#5f6b67]">{template.description || "No description has been added yet."}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-[#f7f9f8] p-3 text-xs"><div><div className="text-[#7a8581]">Routing category</div><div className="mt-1 font-semibold">{template.category || "Not set"}</div></div><div><div className="text-[#7a8581]">Saved versions</div><div className="mt-1 font-semibold">{versionCount}</div></div></div>
          <div className="mt-auto border-t pt-4"><TemplateActions id={template.id} name={template.name} isSystem={template.is_system} archived={template.is_archived} /></div>
        </CardContent>
      </Card>;
    })}</div> : <Card><CardContent className="py-12 text-center"><p className="font-semibold">No matching templates</p><p className="mt-1 text-sm text-[#7a8581]">Try another search or filter.</p></CardContent></Card>}
  </div>;
}
