import Link from "next/link";
import { ArrowRight, Check, FileSpreadsheet, Route, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productName } from "@/lib/utils";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (data.user) redirect("/dashboard");
  return (
    <main className="min-h-screen bg-[#f7f8f7]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3 font-semibold tracking-[-.02em]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#176b55] text-white"><Send size={17} /></span>
          {productName}
        </div>
        <div className="flex gap-2"><Link href="/login"><Button variant="ghost">Sign in</Button></Link><Link href="/register"><Button>Get started</Button></Link></div>
      </nav>
      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-24">
        <div>
          <div className="eyebrow">Spreadsheet to sent — without the busywork</div>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-.055em] text-[#15201d] md:text-7xl">Personalized email, routed automatically.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#5d6965]">Import any Excel or CSV layout, map its columns once, and let each row select the right template. You stay in control from preview through send.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/register"><Button size="lg">Create your workspace <ArrowRight size={16} /></Button></Link><Link href="/login"><Button variant="outline" size="lg">Sign in</Button></Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#596561]">{["Test mode by default", "No stored Microsoft tokens", "Private data with RLS"].map((item) => <span className="flex items-center gap-2" key={item}><Check size={15} className="text-[#176b55]" />{item}</span>)}</div>
        </div>
        <div className="rounded-3xl border bg-white p-4 shadow-[0_28px_80px_rgba(29,52,45,.12)]">
          <div className="rounded-2xl border bg-[#f8faf9] p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">September recipients</span><span className="rounded-full bg-[#e4f4ec] px-2.5 py-1 text-xs font-bold text-[#176b55]">112 ready</span></div>
            <div className="mt-5 space-y-3">{[
              ["Northstar Labs", "Customer welcome", "Ready"],
              ["Harbor Works", "Supplier update", "Ready"],
              ["Juniper House", "Event invitation", "Review"],
              ["Atlas Studio", "Customer welcome", "Ready"],
            ].map(([company, template, state], index) => <div className="grid grid-cols-[26px_1fr_auto] items-center gap-3 rounded-xl border bg-white px-3 py-3" key={company}><span className="grid h-6 w-6 place-items-center rounded-md bg-[#e9f3ef] text-xs font-bold text-[#176b55]">{index + 1}</span><div><div className="text-sm font-semibold">{company}</div><div className="mt-0.5 text-xs text-[#79837f]">{template}</div></div><span className={state === "Ready" ? "text-xs font-semibold text-[#176b55]" : "text-xs font-semibold text-[#a15c07]"}>{state}</span></div>)}</div>
            <div className="mt-4 flex items-center justify-between border-t pt-4"><span className="text-sm text-[#68736f]">4 selected</span><Button size="sm">Send selected <Send size={13} /></Button></div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-24 md:grid-cols-3">{[
        [FileSpreadsheet, "Any spreadsheet", "Map arbitrary headers without deleting the custom columns you rely on."],
        [Route, "Automatic routing", "Use any column as the key and route mixed selections in one send."],
        [ShieldCheck, "Designed for control", "RLS isolation, suppression checks, saved snapshots, and test mode."],
      ].map(([Icon, title, copy]) => { const C = Icon as typeof FileSpreadsheet; return <div className="rounded-2xl border bg-white p-6" key={String(title)}><C className="text-[#176b55]" size={22} /><h2 className="mt-4 font-semibold">{String(title)}</h2><p className="mt-2 text-sm leading-6 text-[#68736f]">{String(copy)}</p></div>; })}</section>
    </main>
  );
}
