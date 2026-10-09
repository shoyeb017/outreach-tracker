import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn("ui-field focus-ring h-10 min-w-0 w-full border border-transparent px-3 text-sm text-[var(--foreground)] disabled:opacity-60", className)} {...props} />;
});
