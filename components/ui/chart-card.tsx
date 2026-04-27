import * as React from "react";
import { AppCard } from "@/components/ui/app-card";
import { cn } from "@/lib/utils";

export interface ChartCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  legend?: React.ReactNode;
  minHeight?: string;
}

function ChartCard({
  title,
  description,
  actions,
  legend,
  minHeight = "18rem",
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <AppCard title={title} description={description} actions={actions} className={className} {...props}>
      <div className="min-w-0" style={{ minHeight }}>
        {children}
      </div>
      {legend ? <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-(--text-tertiary)">{legend}</div> : null}
    </AppCard>
  );
}

function ChartLegendItem({
  color,
  label,
  className,
}: {
  color: string;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export { ChartCard, ChartLegendItem };
