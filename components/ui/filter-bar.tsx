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
        "flex min-w-0 flex-col gap-4 rounded-[1.35rem] border border-indigo-100 bg-white/88 p-3 shadow-[0_18px_52px_rgb(79_70_229_/_0.08)] backdrop-blur sm:p-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {search ? <div className="min-w-0 flex-1 [&_input]:min-h-12">{search}</div> : null}
        {filters ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:flex-none [&_[role=combobox]]:min-h-12 [&_.rounded-full]:bg-slate-50 [&_.rounded-full]:shadow-sm">{filters}</div> : null}
        {(onReset || actions) ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:ml-auto [&_button]:min-h-11 [&_button]:rounded-2xl">
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
