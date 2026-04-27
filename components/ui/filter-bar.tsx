import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  onReset?: () => void;
  resetLabel?: string;
}

function FilterBar({
  search,
  filters,
  actions,
  onReset,
  resetLabel = "重置",
  className,
  children,
  ...props
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-(--border) bg-white p-3 shadow-[var(--shadow-card)] sm:p-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {search ? <div className="min-w-0 flex-1 [&_input]:min-h-11 sm:[&_input]:min-h-10">{search}</div> : null}
        {filters ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-none [&_[role=combobox]]:min-h-11 sm:[&_[role=combobox]]:min-h-10">{filters}</div> : null}
        {(onReset || actions) ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto [&_button]:min-h-11 sm:[&_button]:min-h-10">
            {onReset ? (
              <Button variant="outline" onClick={onReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {resetLabel}
              </Button>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export { FilterBar };
