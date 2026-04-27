import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { AppCard } from "@/components/ui/app-card";
import { cn } from "@/lib/utils";

export type MetricTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";
export type MetricTrend = "up" | "down" | "flat";

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: MetricTrend;
  trendLabel?: React.ReactNode;
  tone?: MetricTone;
}

const toneClassMap: Record<MetricTone, string> = {
  primary: "bg-(--primary-soft) text-(--primary)",
  success: "bg-(--success-soft) text-(--success-foreground)",
  warning: "bg-(--warning-soft) text-(--warning-foreground)",
  danger: "bg-(--danger-soft) text-(--danger-foreground)",
  info: "bg-(--info-soft) text-(--info-foreground)",
  neutral: "bg-(--neutral-soft) text-(--neutral-foreground)",
};

const trendIconMap = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

function MetricCard({
  label,
  value,
  description,
  icon,
  trend,
  trendLabel,
  tone = "primary",
  className,
  ...props
}: MetricCardProps) {
  const TrendIcon = trend ? trendIconMap[trend] : null;

  return (
    <AppCard className={cn("min-h-32", className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-(--text-tertiary)">{label}</p>
          <div className="mt-2 text-2xl font-semibold leading-tight text-(--text-primary)">{value}</div>
        </div>
        {icon ? <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneClassMap[tone])}>{icon}</div> : null}
      </div>
      {(description || trendLabel) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-(--text-tertiary)">
          {trendLabel && TrendIcon ? (
            <span className={cn("inline-flex items-center gap-1 font-medium", toneClassMap[tone], "rounded-full px-2 py-0.5")}>
              <TrendIcon className="h-3.5 w-3.5" />
              {trendLabel}
            </span>
          ) : null}
          {description ? <span>{description}</span> : null}
        </div>
      ) : null}
    </AppCard>
  );
}

export { MetricCard };
