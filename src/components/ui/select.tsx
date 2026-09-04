import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn("focus-ring h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-sm", className)} {...props} />;
});
