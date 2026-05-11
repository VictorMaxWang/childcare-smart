import * as React from "react";
import { ReplicaMetricCard, type ReplicaTone, type ReplicaTrend } from "@/components/cards";

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
  return (
    <ReplicaMetricCard
      {...props}
      className={className}
      description={description}
      icon={icon}
      label={label}
      tone={tone as ReplicaTone}
      trend={trend as ReplicaTrend | undefined}
      trendLabel={trendLabel}
      value={value}
    />
  );
}

export { MetricCard };
