"use client";

import { useState } from "react";
import { Eye, Mail, Search } from "lucide-react";
import { TemplateActions } from "./template-actions";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { formatDate } from "@/lib/utils";

export type TemplateListItem = {
  id: string; name: string; description: string | null; category: string | null;
  is_system: boolean; is_active: boolean; is_archived: boolean; updated_at: string;
  subject_template?: string; html_body?: string;
  template_versions: { count: number }[] | null;
};
type Filter = "all" | "personal" | "system" | "archived";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All templates" }, { value: "personal", label: "My templates" },
  { value: "system", label: "Ready-made templates" }, { value: "archived", label: "Archived" },
];

export function TemplateLibrary({ templates }: { templates: TemplateListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState<TemplateListItem | null>(null);
  const categories = [...new Set(templates.map((template) => template.category).filter(Boolean) as string[])].sort();
  const search = query.trim().toLowerCase();
  const visible = templates.filter((template) => {
      const matches = filter === "archived" ? template.is_archived : !template.is_archived && (filter === "all" || (filter === "personal" ? !template.is_system : template.is_system));
      return matches && (!category || template.category === category) && (!search || [template.name, template.description, template.category, template.subject_template].some((value) => value?.toLowerCase().includes(search)));
    }).sort((a, b) => sort === "recent" ? b.updated_at.localeCompare(a.updated_at) : a.name.localeCompare(b.name));
  function clear() { setQuery(""); setCategory(""); setFilter("all"); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--accent)] p-5">
      <div className="max-w-2xl"><h2 className="font-semibold">Start with a message, make it yours</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Preview a ready-made email and make a copy to customize it, or write your own. Choose the saved template when setting up a spreadsheet.</p></div>
      <ButtonLink href="/templates/new">Write a new template</ButtonLink>
    </div>
    <Card><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Filter templates">{filters.map((item) => <Button key={item.value} variant={filter === item.value ? "secondary" : "ghost"} size="sm" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span className="text-xs opacity-70">{templates.filter((template) => item.value === "archived" ? template.is_archived : !template.is_archived && (item.value === "all" || (item.value === "personal" ? !template.is_system : template.is_system))).length}</span></Button>)}</div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 text-[var(--muted-foreground)]" size={16} /><Input aria-label="Search templates" className="pl-9" placeholder="Find an email by name, industry, or subject" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select aria-label="Template category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</Select><Select aria-label="Sort templates" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name: A to Z</option><option value="recent">Recently updated</option></Select></div>
    </CardContent></Card>
    <p role="status" className="text-sm text-[var(--muted-foreground)]">{visible.length} {visible.length === 1 ? "template" : "templates"} shown{filter === "archived" ? " · Restore a template to use it again." : " · Archived templates are hidden."}</p>
    {visible.length ? <div className="stagger-grid grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">{visible.map((template) => <Card key={template.id} className="flex min-w-0 flex-col"><CardContent className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap gap-2"><Badge tone={template.is_system ? "info" : "neutral"}>{template.is_system ? "Ready-made" : "My template"}</Badge><Badge tone={template.is_archived ? "neutral" : template.is_active ? "success" : "warning"}>{template.is_archived ? "Archived" : template.is_active ? "Available" : "Not available"}</Badge></div>
      <h2 className="break-words text-lg font-semibold">{template.name}</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">{template.category || "General email"}</p>
      <div className="my-4 rounded-lg bg-[var(--surface-hover)] p-3"><p className="text-xs font-semibold normal-case text-[var(--muted-foreground)]">Email subject</p><p className="mt-1 line-clamp-2 break-words text-sm">{template.subject_template || "Open to view the message"}</p></div>
      <p className="line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">{template.description || (template.is_system ? "Make a copy to adapt this email to your business." : "Your reusable email, ready to personalize for each recipient.")}</p>
      <div className="mt-auto pt-5"><Button variant="outline" className="mb-3 w-full" onClick={() => setSelected(template)}><Eye size={15} />Preview email</Button><TemplateActions id={template.id} name={template.name} isSystem={template.is_system} archived={template.is_archived} /><p className="mt-4 text-xs text-[var(--muted-foreground)]">Updated {formatDate(template.updated_at)}</p></div>
    </CardContent></Card>)}</div> : <Card><CardContent className="space-y-3 py-12 text-left"><Mail className="mx-auto text-[var(--muted-foreground)]" size={26} /><h2 className="font-semibold">No templates match these choices</h2><p className="text-sm text-[var(--muted-foreground)]">Try a different search or category.</p><Button variant="outline" onClick={clear}>Clear filters</Button>{filter === "personal" && <ButtonLink className="ml-2" href="/templates/new">Create your first template</ButtonLink>}</CardContent></Card>}
    {selected && <Dialog title={selected.name} onClose={() => setSelected(null)}><p className="mb-4 rounded-lg bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">This is a reusable message, not a sent email. Fields such as {"{{company_name}}"} will use spreadsheet values. Open the template for an editable sample preview.</p><p className="mb-4 border-b pb-4 text-sm"><strong>Subject: </strong>{selected.subject_template || "Not provided"}</p><div className="email-content text-sm leading-7" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selected.html_body || "<p>Open this template to see the full message.</p>") }} /><div className="mt-6 flex flex-wrap gap-3"><ButtonLink href={`/templates/${selected.id}`} variant="outline">{selected.is_system ? "View template" : "Open editor"}</ButtonLink><ButtonLink href={`/templates/${selected.id}?duplicate=1`}>Make a copy</ButtonLink></div></Dialog>}
  </div>;
}
