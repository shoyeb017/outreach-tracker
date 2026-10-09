"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [["/admin", "Overview"], ["/admin/microsoft-settings", "Microsoft setup"], ["/admin/users", "Users"], ["/admin/security", "Security & audit"], ["/help", "Setup guide"]];
export function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="admin-tabs mb-10 text-sm text-[var(--muted-foreground)]">{links.map(([href, label]) => <Link className="focus-ring hover:text-[var(--foreground)]" href={href} key={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
