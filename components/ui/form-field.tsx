import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  description?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

function FormField({
  label,
  htmlFor,
  required = false,
  description,
  error,
  className,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("min-w-0 space-y-2.5", className)} {...props}>
      {label ? (
        <Label htmlFor={htmlFor} className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          <span className="min-w-0 break-words">{label}</span>
          {required ? (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[11px] leading-none text-rose-600" aria-hidden="true">
              必填
            </span>
          ) : null}
        </Label>
      ) : null}
      {children}
      {description && !error ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{description}</p> : null}
      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700" role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
