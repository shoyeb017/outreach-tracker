"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3, Database, LayoutDashboard, LogOut, Mail, Menu, PlugZap, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const mobileItems = [
  ["/dashboard", "Dashboard", LayoutDashboard], ["/datasets", "Datasets", Database], ["/templates", "Templates", Mail], ["/history", "History", Clock3], ["/settings", "Settings", Settings],
] as const;

export function AppHeader({ email, microsoftConnected, liveEnabled }: { email?: string; microsoftConnected: boolean; liveEnabled: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const [pending, setPending] = useState(false); const [open, setOpen] = useState(false);
  const showBack = pathname !== "/dashboard";
  async function logout() { setPending(true); await getSupabaseBrowserClient().auth.signOut(); router.push("/login"); router.refresh(); }
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard");
  }
  return <>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-5 backdrop-blur md:px-8">
      <div className="flex items-center gap-2">
        <button className="focus-ring grid h-9 w-9 place-items-center rounded-lg md:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button>
        {showBack && <Button variant="ghost" size="sm" aria-label="Go back" title="Go back to the previous page" onClick={goBack}><ArrowLeft size={16} /><span className="hidden sm:inline">Back</span></Button>}
        <div className="hidden items-center gap-2 md:flex"><Badge tone={liveEnabled ? "danger" : "success"}>{liveEnabled ? "Live sending" : "Test mode"}</Badge><Badge tone={microsoftConnected ? "success" : "warning"}><PlugZap size={12} className="mr-1" />{microsoftConnected ? "Microsoft connected" : "Microsoft not connected"}</Badge></div>
      </div>
      <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="max-w-52 truncate text-xs font-semibold">{email || "Workspace"}</div><div className="text-[11px] text-[#7a8581]">Account</div></div><Button title="Sign out" variant="ghost" size="icon" onClick={logout} disabled={pending}><LogOut size={16} /></Button></div>
    </header>
    {open && <div className="fixed inset-0 z-50 bg-[#10211b]/45 md:hidden" onClick={() => setOpen(false)}><nav className="h-full w-[82%] max-w-80 border-r bg-[#f4f7f5] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-6 flex items-center justify-between px-2"><span className="font-semibold">Navigation</span><Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X size={18} /></Button></div><div className="space-y-1">{mobileItems.map(([href, label, Icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-[#4d5b57] hover:bg-white"><Icon size={17} />{label}</Link>)}</div><div className="mt-7 rounded-xl border bg-white p-3"><Badge tone={liveEnabled ? "danger" : "success"}>{liveEnabled ? "Live sending" : "Test mode"}</Badge><p className="mt-2 text-xs leading-5 text-[#68736f]">{microsoftConnected ? "Microsoft account connected" : "Microsoft account not connected"}</p></div></nav></div>}
  </>;
}
