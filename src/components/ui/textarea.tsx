import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("focus-ring min-h-24 w-full resize-y rounded-lg border bg-white px-3 py-2 text-sm leading-6 shadow-sm placeholder:text-[#919b98]", className)} {...props} />;
});
