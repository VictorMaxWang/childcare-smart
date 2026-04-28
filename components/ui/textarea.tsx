import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-32 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-6 text-(--text-primary) shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] ring-offset-background transition-all placeholder:text-slate-400 hover:border-indigo-200 hover:bg-white focus-visible:border-indigo-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 aria-invalid:border-rose-300 aria-invalid:bg-rose-50/50 aria-invalid:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-(--text-disabled) disabled:opacity-80 sm:min-h-28",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
