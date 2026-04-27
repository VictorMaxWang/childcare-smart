import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-28 w-full rounded-md border border-(--input) bg-(--input-background) px-3 py-2 text-sm text-(--text-primary) shadow-xs ring-offset-background transition-colors placeholder:text-(--text-helper) hover:border-(--input-hover) focus-visible:border-(--primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 aria-invalid:border-(--danger) aria-invalid:ring-(--danger) disabled:cursor-not-allowed disabled:bg-(--secondary) disabled:text-(--text-disabled) disabled:opacity-80 sm:min-h-24",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
