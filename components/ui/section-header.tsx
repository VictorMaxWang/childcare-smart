import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

function SectionHeader({ title, description, actions, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-tight text-(--text-primary)">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-(--text-tertiary)">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { SectionHeader };
