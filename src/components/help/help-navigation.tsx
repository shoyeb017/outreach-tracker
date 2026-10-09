"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { helpDocuments } from "@/lib/help/documents";
export function HelpNavigation({ returnHref, returnLabel }: { returnHref: string; returnLabel: string }) {
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const results = helpDocuments.filter((document) => document.navTitle.toLowerCase().includes(query.toLowerCase().trim()));
  return <nav aria-label="Help center" className="help-guide-nav">
    <Label htmlFor="help-search">Find a guide</Label><Input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guide titles" />
    {["Start here", "Connect Microsoft", "Review & recover"].map((group) => results.some((document) => document.group === group) && <section key={group} className="help-nav-group"><h2>{group}</h2><ul>{results.filter((document) => document.group === group).map((document) => <li key={document.slug}><Link className="focus-ring" aria-current={pathname === document.href ? "page" : undefined} href={document.href}>{document.navTitle}</Link></li>)}</ul></section>)}
    {!results.length && <p role="status" className="mt-4 text-sm">No matching guides. Try “permissions”, “safety”, or “setup”.</p>}
    <Link className="focus-ring mt-6 block border-t pt-4 text-sm text-[var(--primary)]" href={returnHref}>{returnLabel}</Link>
  </nav>;
}
