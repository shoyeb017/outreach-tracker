import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card className="flex min-h-64 flex-col items-start justify-center px-6 py-10 text-left">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border bg-[var(--surface-hover)] text-[var(--primary)]"><Icon size={22} /></div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
