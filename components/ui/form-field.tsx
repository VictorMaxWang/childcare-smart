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
    <div className={cn("min-w-0 space-y-2", className)} {...props}>
      {label ? (
        <Label htmlFor={htmlFor} className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 break-words">{label}</span>
          {required ? <span className="text-(--danger)" aria-hidden="true">*</span> : null}
        </Label>
      ) : null}
      {children}
      {description && !error ? <p className="text-xs leading-5 text-(--text-tertiary)">{description}</p> : null}
      {error ? (
        <p className="text-xs leading-5 text-(--danger-foreground)" role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
