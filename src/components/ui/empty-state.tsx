import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border bg-[#f5f8f6] text-[var(--primary)]"><Icon size={22} /></div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
