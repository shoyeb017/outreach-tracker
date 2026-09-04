import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    neutral: "bg-[#eef1f0] text-[#53605c]",
    success: "bg-[#e4f4ec] text-[#176b55]",
    warning: "bg-[#fff2d9] text-[#895006]",
    danger: "bg-[#fde8e6] text-[#9b241c]",
    info: "bg-[#e8effc] text-[#315b9e]",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", tones[tone], className)} {...props} />;
}
