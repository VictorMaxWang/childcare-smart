import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.01em] transition-colors backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-linear-to-r from-indigo-500 to-violet-500 text-(--primary-foreground)",
        secondary: "border-transparent bg-(--secondary) text-(--secondary-foreground)",
        destructive: "border-transparent bg-rose-100 text-rose-700",
        outline: "border-white/70 bg-white/62 text-(--foreground)",
        success: "border-transparent bg-emerald-100/90 text-emerald-700",
        warning: "border-transparent bg-amber-100/90 text-amber-700",
        info: "border-transparent bg-sky-100/90 text-sky-700",
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
