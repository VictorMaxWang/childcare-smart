import * as React from "react";
import { AppCard } from "@/components/ui/app-card";
import { cn } from "@/lib/utils";

export interface DataTableShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: boolean;
}

function DataTableShell({
  title,
  description,
  actions,
  footer,
  empty,
  isEmpty = false,
  className,
  children,
  ...props
}: DataTableShellProps) {
  return (
    <AppCard
      title={title}
      description={description}
      actions={actions}
      footer={footer}
      padded={false}
      className={className}
      {...props}
    >
      {isEmpty && empty ? (
        <div className="p-5 sm:p-6">{empty}</div>
      ) : (
        <div className={cn("app-table-scroll", title || description || actions ? "border-t border-(--border-subtle)" : undefined)}>
          {children}
        </div>
      )}
    </AppCard>
  );
}

export { DataTableShell };
