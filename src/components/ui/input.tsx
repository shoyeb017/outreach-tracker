import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("ui-field focus-ring h-10 min-w-0 w-full border border-transparent px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] disabled:opacity-60 disabled:cursor-not-allowed", className)} {...props} />;
});
