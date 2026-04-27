import * as React from "react";
import { cn } from "@/lib/utils";

export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4;
  dense?: boolean;
}

const columnClassMap: Record<NonNullable<ResponsiveGridProps["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

function ResponsiveGrid({ columns = 3, dense = false, className, ...props }: ResponsiveGridProps) {
  return (
    <div
      className={cn("grid", columnClassMap[columns], dense ? "gap-3" : "gap-4 sm:gap-5", className)}
      {...props}
    />
  );
}

export { ResponsiveGrid };
