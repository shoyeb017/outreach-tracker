"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, Database, LayoutDashboard, Mail, Send, Settings } from "lucide-react";
import { cn, productName } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/templates", label: "Templates", icon: Mail },
  { href: "/history", label: "History", icon: Clock3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="desktop-sidebar sticky top-0 flex h-screen flex-col border-r bg-[#f1f4f2] p-4"><Link href="/dashboard" className="flex items-center gap-3 px-2 py-2 font-semibold tracking-[-.02em]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#176b55] text-white"><Send size={17} /></span><span className="max-w-36 leading-tight">{productName}</span></Link><nav className="mt-8 space-y-1">{items.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition", active ? "bg-white text-[#176b55] shadow-sm" : "text-[#596561] hover:bg-white/70 hover:text-[#17201e]")}><Icon size={17} />{label}</Link>; })}</nav><div className="mt-auto rounded-xl border bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-[#176b55]">Test mode</div><p className="mt-1 text-xs leading-5 text-[#68736f]">Live email is off until explicitly enabled in Settings.</p></div></aside>;
}
