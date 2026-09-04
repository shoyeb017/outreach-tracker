import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  "as-resource"?: string;
}

const variants: Record<Variant, string> = {
  default: "bg-[var(--primary)] text-white shadow-sm hover:bg-[#125b48]",
  secondary: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[#dcece5]",
  outline: "border bg-white text-[#26322f] shadow-sm hover:bg-[#f7f9f8]",
  ghost: "text-[#4d5b57] hover:bg-[#edf1ef] hover:text-[#17201e]",
  danger: "bg-[#b42318] text-white hover:bg-[#912018]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 rounded-lg px-3 text-xs",
  md: "h-10 rounded-lg px-4 text-sm",
  lg: "h-11 rounded-xl px-5 text-sm",
  icon: "h-9 w-9 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", type = "button", ...props }, ref,
) {
  return <button ref={ref} type={type} className={cn("focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />;
});
