import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 min-h-11 w-full rounded-md border border-(--input) bg-(--input-background) px-3 py-2 text-sm text-(--text-primary) shadow-xs ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-(--text-helper) hover:border-(--input-hover) focus-visible:border-(--primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 aria-invalid:border-(--danger) aria-invalid:ring-(--danger) disabled:cursor-not-allowed disabled:bg-(--secondary) disabled:text-(--text-disabled) disabled:opacity-80 sm:h-10 sm:min-h-10",
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
