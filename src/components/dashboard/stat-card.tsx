import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, detail, icon: Icon, tone = "green" }: { label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "green" | "blue" | "amber" | "red" }) {
  const tones = { green: "bg-[#e8f3ee] text-[#176b55]", blue: "bg-[#eaf0fb] text-[#315b9e]", amber: "bg-[#fff2d9] text-[#895006]", red: "bg-[#fde8e6] text-[#9b241c]" };
  return <Card><CardContent className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#74807c]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em]">{value}</p>{detail && <p className="mt-1 text-xs text-[#7a8581]">{detail}</p>}</div><span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span></CardContent></Card>;
}
