import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  "as-resource"?: string;
}

const variants: Record<Variant, string> = {
  default: "ui-button-primary bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
  secondary: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]",
  outline: "border border-[var(--input-border)] bg-transparent text-[var(--primary)] hover:bg-[var(--accent)]",
  ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger-soft)]",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 rounded-lg px-3 py-1.5 text-sm",
  md: "min-h-10 rounded-lg px-4 py-2 text-sm",
  lg: "min-h-11 rounded-lg px-5 py-2.5 text-sm",
  icon: "h-11 w-11 shrink-0 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", type = "button", ...props }, ref,
) {
  return <button ref={ref} type={type} className={cn("ui-button focus-ring inline-flex items-center justify-center gap-2 max-w-full whitespace-normal text-center leading-snug font-semibold disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />;
});

export function ButtonLink({ className, variant = "default", size = "md", ...props }: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn("ui-button focus-ring inline-flex items-center justify-center gap-2 max-w-full whitespace-normal text-center leading-snug font-semibold", variants[variant], sizes[size], className)} {...props} />;
}
