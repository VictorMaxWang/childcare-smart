import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 min-h-12 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm text-(--text-primary) shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] ring-offset-background transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-indigo-200 hover:bg-white focus-visible:border-indigo-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 aria-invalid:border-rose-300 aria-invalid:bg-rose-50/50 aria-invalid:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-(--text-disabled) disabled:opacity-80 sm:h-11 sm:min-h-11",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
