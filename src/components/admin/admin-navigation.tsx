"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Mail, ShieldCheck, BookOpen } from "lucide-react";
const links = [{ href: "/admin", label: "Overview", icon: LayoutDashboard }, { href: "/admin/microsoft-settings", label: "Microsoft setup", icon: Mail }, { href: "/admin/users", label: "Users", icon: Users }, { href: "/admin/security", label: "Security & audit", icon: ShieldCheck }, { href: "/help", label: "Setup guide", icon: BookOpen }];
export function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="admin-tabs mb-7 text-sm text-[var(--muted-foreground)]">{links.map(({ href, label, icon: Icon }) => <Link className="focus-ring inline-flex items-center gap-2 hover:text-[var(--foreground)]" href={href} key={href} aria-current={pathname === href || (href !== "/admin" && pathname.startsWith(href + "/")) ? "page" : undefined}><Icon size={16} aria-hidden="true" />{label}</Link>)}</nav>;
}
