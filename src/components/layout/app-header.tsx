"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3, Database, LayoutDashboard, LogOut, Mail, Menu, PlugZap, Settings, CircleHelp, Home, Inbox, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOutOfApplication } from "@/lib/auth/sign-out";

const mobileItems = [
  ["/inbox", "Inbox", Inbox], ["/compose", "Compose email", SquarePen],
  ["/dashboard", "Dashboard", LayoutDashboard], ["/datasets", "Spreadsheets", Database], ["/templates", "Email templates", Mail], ["/history", "Send history", Clock3], ["/settings", "Settings", Settings],
  ["/help", "Help & safety", CircleHelp], ["/", "Landing page", Home],
] as const;

export function AppHeader({ email, microsoftConnected, microsoftEmail, liveEnabled, microsoftClientIds = [] }: { email?: string; microsoftConnected: boolean; microsoftEmail?: string | null; liveEnabled: boolean; microsoftClientIds?: string[] }) {
  const router = useRouter(); const pathname = usePathname(); const [pending, setPending] = useState(false); const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const showBack = pathname !== "/dashboard";
  const sender = microsoftConnected ? microsoftEmail?.trim() : null;
  async function logout() {
    if (pending) return; setPending(true); setLogoutError("");
    try {
      await signOutOfApplication(microsoftClientIds);
      router.push("/login"); router.refresh();
    } catch (error) { setLogoutError(error instanceof Error ? error.message : "Could not sign out safely. Try again."); }
    finally { setPending(false); }
  }
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard");
  }
  return <>
    <header className="workspace-navbar sticky top-0 z-30 flex min-h-16 min-w-0 items-center justify-between gap-3 border-b px-3 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <button className="focus-ring grid h-11 w-11 place-items-center rounded-lg lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button>
        {showBack && <Button variant="ghost" size="sm" aria-label="Go back" title="Go back to the previous page" onClick={goBack}><ArrowLeft size={16} /><span className="hidden sm:inline">Back</span></Button>}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2"><Badge tone={liveEnabled ? "danger" : "info"}>{liveEnabled ? "Real sending" : "Practice mode"}</Badge><Link href="/settings#microsoft" className="focus-ring min-w-0 max-w-full rounded-lg" aria-label={sender ? `Connected Microsoft sender: ${sender}` : "Microsoft not connected. Open email account settings"} title={sender ? `Sending from ${sender}` : "Connect your Microsoft sending account"}><Badge tone={sender ? "success" : "warning"}><PlugZap size={12} className="shrink-0" /><span className="min-w-0 break-all sm:max-w-64 sm:truncate sm:break-normal">{sender ? `Sender: ${sender}` : "Microsoft not connected"}</span></Badge></Link></div>
      </div>
      <div className="flex shrink-0 items-center gap-2"><div className="hidden text-right xl:block"><div className="max-w-52 truncate text-xs font-semibold">{email || "Workspace"}</div><div className="text-[11px] text-[var(--muted-foreground)]">Account</div></div><ThemeToggle /><Button aria-label="Sign out" title="Sign out" variant="ghost" size="icon" onClick={logout} disabled={pending}><LogOut size={16} /></Button></div>
    </header>
    {logoutError && <p role="alert" className="border-b bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{logoutError}</p>}
    {open && <Dialog title="Navigation" onClose={() => setOpen(false)}><nav className="space-y-2">{mobileItems.map(([href, label, Icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} aria-current={(href === "/" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined} className="flex items-center gap-3 rounded-lg border px-3 py-3 text-sm font-semibold hover:bg-[var(--accent)]"><Icon size={17} />{label}</Link>)}<p className="pt-3 text-xs text-[var(--muted-foreground)]">{liveEnabled ? "Real emails enabled" : "Campaign practice mode — manual and test emails need confirmation"}</p></nav></Dialog>}
  </>;
}
