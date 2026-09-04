import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("focus-ring h-10 w-full rounded-lg border bg-white px-3 text-sm text-[#17201e] shadow-sm placeholder:text-[#919b98] disabled:bg-[#f3f5f4]", className)} {...props} />;
});
