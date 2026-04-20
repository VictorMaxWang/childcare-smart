import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.01em] transition-colors backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-linear-to-r from-indigo-500 to-violet-500 text-(--primary-foreground)",
        secondary: "border-white/12 bg-white/8 text-white/84",
        destructive: "border-rose-300/20 bg-rose-400/10 text-rose-100",
        outline: "border-white/14 bg-white/6 text-white/76",
        success: "border-violet-300/20 bg-violet-400/10 text-violet-100",
        warning: "border-violet-200/24 bg-violet-300/12 text-violet-50",
        info: "border-indigo-300/20 bg-indigo-400/10 text-indigo-100",
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
