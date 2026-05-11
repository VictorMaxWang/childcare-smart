import * as React from "react";
import { ReplicaChartFrame, ReplicaChartLegendItem } from "@/components/charts";

export interface ChartCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
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
    <ReplicaChartFrame
      title={title}
      description={description}
      actions={actions}
      legend={legend}
      minHeight={minHeight}
      className={className}
      {...props}
    >
      {children}
    </ReplicaChartFrame>
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
  return <ReplicaChartLegendItem color={color} label={label} className={className} />;
}

export { ChartCard, ChartLegendItem };
