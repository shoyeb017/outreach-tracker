"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, Database, LayoutDashboard, Mail, Settings, CircleHelp, Inbox, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/brand-logo";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/compose", label: "Compose email", icon: SquarePen },
  { href: "/datasets", label: "Spreadsheets", icon: Database },
  { href: "/templates", label: "Email templates", icon: Mail },
  { href: "/history", label: "Send history", icon: Clock3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & safety", icon: CircleHelp },
];

export function Sidebar({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const pathname = usePathname();
  return <aside className="desktop-sidebar sticky top-0 flex h-dvh flex-col overflow-y-auto border-r bg-[var(--sidebar)] p-4 text-[var(--foreground)]">
    <Link href="/" aria-label="Landing page" className="focus-ring block border-b px-1 pb-4 pt-2"><BrandLogo /></Link>
    <nav aria-label="Main navigation" className="mt-6 space-y-1">{items.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("focus-ring flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors", active ? "border-[var(--primary)] bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold" : "border-transparent text-[var(--sidebar-muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)]")}><Icon size={18} />{label}</Link>; })}</nav>
    <div className="mt-auto border-t pt-6"><div className="text-sm font-bold">{liveEnabled ? "Real sending enabled" : "Practice mode"}</div><p className="mt-2 text-xs leading-6 text-[var(--sidebar-muted)]">{liveEnabled ? "Review every batch before sending real emails." : "Campaigns stay in practice mode until enabled. Manual and test emails need separate confirmation."}</p></div>
  </aside>;
}
