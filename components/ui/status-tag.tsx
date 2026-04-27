import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTagVariant = "success" | "warning" | "danger" | "info" | "neutral" | "pending";

export interface StatusTagProps extends Omit<BadgeProps, "variant"> {
  variant?: StatusTagVariant;
  showDot?: boolean;
}

const dotColorMap: Record<StatusTagVariant, string> = {
  success: "bg-(--success)",
  warning: "bg-(--warning)",
  danger: "bg-(--danger)",
  info: "bg-(--info)",
  neutral: "bg-(--neutral)",
  pending: "bg-(--pending)",
};

function StatusTag({
  variant = "neutral",
  showDot = false,
  className,
  children,
  ...props
}: StatusTagProps) {
  return (
    <Badge variant={variant} className={cn("font-medium", className)} {...props}>
      {showDot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotColorMap[variant])} aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}

export { StatusTag };
