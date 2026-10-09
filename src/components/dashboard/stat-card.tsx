import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, detail, icon: Icon, tone = "green" }: { label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "green" | "blue" | "amber" | "red" }) {
  const tones = { green: "bg-[var(--accent)] text-[var(--primary)]", blue: "bg-[var(--info-soft)] text-[var(--info)]", amber: "bg-[var(--muted)] text-[var(--muted-foreground)]", red: "bg-[var(--muted)] text-[var(--danger)]" };
  return <Card><CardContent className="flex items-start justify-between gap-3"><div><p className="min-h-12 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em]">{value}</p>{detail && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{detail}</p>}</div><span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span></CardContent></Card>;
}
