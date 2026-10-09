import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("ui-field focus-ring min-h-28 w-full resize-y border border-transparent px-4 py-4 text-sm leading-7 placeholder:text-[var(--muted-foreground)]", className)} {...props} />;
});
