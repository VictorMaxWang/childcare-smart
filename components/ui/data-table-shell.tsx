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
      className={cn("border-indigo-100 bg-white/92 shadow-[0_22px_70px_rgb(79_70_229_/_0.08)]", className)}
      {...props}
    >
      {isEmpty && empty ? (
        <div className="p-5 sm:p-6">{empty}</div>
      ) : (
        <div className={cn("app-table-scroll", title || description || actions ? "border-t border-indigo-50" : undefined)}>
          <div className="flex items-center justify-between gap-3 border-b border-indigo-50 bg-indigo-50/35 px-5 py-2 text-xs text-slate-500 lg:hidden">
            <span>左右滑动查看完整字段</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-indigo-600 shadow-sm">表格视图</span>
          </div>
          {children}
        </div>
      )}
    </AppCard>
  );
}

export { DataTableShell };
