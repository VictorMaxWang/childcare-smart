import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShellBreadcrumb({
  active,
  className,
  cue,
}: {
  active: ReactNode;
  className?: string;
  cue: ReactNode;
}) {
  return (
    <div
      data-testid="r02-shell-breadcrumb"
      className={cn("hidden min-w-0 items-center gap-2 text-sm font-medium text-slate-500 xl:flex", className)}
    >
      <span>{cue}</span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <span className="truncate text-slate-900">{active}</span>
    </div>
  );
}
