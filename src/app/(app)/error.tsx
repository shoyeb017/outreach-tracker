"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ retry }: { retry: () => void }) {
  return <main className="page-shell"><div className="rounded-2xl border bg-[var(--card)] p-8"><h1 className="text-xl font-semibold">We couldn&apos;t load this page</h1><p className="my-4 text-sm text-[var(--muted-foreground)]">Your saved spreadsheet and email history remain available. Try loading the page again.</p><div className="flex gap-3"><Button onClick={retry}>Try again</Button><Link href="/dashboard" className="text-sm font-semibold text-[var(--primary)]">Return to dashboard</Link></div></div></main>;
}
