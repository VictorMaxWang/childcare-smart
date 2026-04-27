import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-(--primary) text-(--primary-foreground)",
        secondary: "border-transparent bg-(--secondary) text-(--secondary-foreground)",
        destructive: "border-transparent bg-(--destructive) text-(--destructive-foreground)",
        outline: "border-(--border) bg-white text-(--foreground)",
        success: "border-(--success-border) bg-(--success-soft) text-(--success-foreground)",
        warning: "border-(--warning-border) bg-(--warning-soft) text-(--warning-foreground)",
        danger: "border-(--danger-border) bg-(--danger-soft) text-(--danger-foreground)",
        info: "border-(--info-border) bg-(--info-soft) text-(--info-foreground)",
        neutral: "border-(--neutral-border) bg-(--neutral-soft) text-(--neutral-foreground)",
        pending: "border-(--pending-border) bg-(--pending-soft) text-(--pending-foreground)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
