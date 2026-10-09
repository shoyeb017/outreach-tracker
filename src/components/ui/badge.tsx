import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "bg-[var(--info-soft)] text-[var(--info)]",
  };
  return <span className={cn("inline-flex min-w-0 items-center max-w-full gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold leading-5 whitespace-normal [overflow-wrap:anywhere]", tones[tone], className)} {...props} />;
}
