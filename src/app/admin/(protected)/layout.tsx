import Link from "next/link";
import { requireAdministrator } from "@/lib/admin/server";
import { AdminLogout } from "@/components/admin/admin-logout";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/brand-logo";
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdministrator();
  return <div><header className="workspace-navbar sticky top-0 z-30 border-b"><div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-10"><Link href="/admin" className="focus-ring inline-flex flex-wrap items-center gap-2"><BrandLogo /><span className="text-xs text-[var(--muted-foreground)]">Administration</span></Link><div className="flex items-center gap-2"><Link href="/" className="focus-ring rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--accent)]">Landing page</Link><ThemeToggle /><AdminLogout /></div></div></header><div className="page-shell admin-shell"><div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]"><p className="break-all">Signed in as {admin.email}</p><Link href="/help" className="focus-ring underline underline-offset-4">Need setup help?</Link></div><AdminNavigation />{children}</div></div>;
}
