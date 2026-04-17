import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "interactive-press inline-flex items-center justify-center whitespace-nowrap rounded-xl border text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-linear-to-br from-indigo-500 via-indigo-500 to-violet-500 text-(--primary-foreground) shadow-[var(--shadow-brand)] hover:shadow-[var(--shadow-brand-strong)]",
        destructive: "border-transparent bg-linear-to-br from-rose-500 to-orange-500 text-(--destructive-foreground) shadow-[0_16px_40px_rgba(244,63,94,0.22)] hover:shadow-[0_22px_50px_rgba(244,63,94,0.28)]",
        outline: "border-white/70 bg-white/74 text-(--foreground) shadow-[var(--shadow-card)] backdrop-blur-xl hover:border-(--border-strong) hover:bg-white/90",
        secondary: "border-transparent bg-(--secondary) text-(--secondary-foreground) shadow-[var(--shadow-card)] hover:bg-white/92",
        ghost: "border-transparent bg-transparent text-(--foreground) hover:bg-white/68",
        link: "border-transparent bg-transparent text-(--primary) underline-offset-4 hover:underline",
        premium: "border-transparent bg-linear-to-br from-indigo-500 via-violet-500 to-sky-500 text-white shadow-[var(--shadow-brand)] hover:shadow-[var(--shadow-brand-strong)]",
        glass: "border-white/70 bg-white/68 text-(--foreground) shadow-[var(--shadow-card)] backdrop-blur-2xl hover:bg-white/84",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  glow?: "none" | "soft" | "brand";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, glow = "none", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          glow === "soft" ? "shadow-[var(--shadow-card)]" : null,
          glow === "brand" ? "shadow-[var(--shadow-brand)]" : null,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
