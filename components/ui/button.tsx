import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--replica-radius-control)] text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:pointer-events-none disabled:border-slate-200 disabled:bg-none disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:opacity-100 aria-disabled:pointer-events-none aria-disabled:border-slate-200 aria-disabled:bg-none aria-disabled:bg-slate-100 aria-disabled:text-slate-500 aria-disabled:shadow-none aria-disabled:opacity-100 data-[loading=true]:cursor-wait active:scale-[0.99]",
  {
    variants: {
      variant: {
        default: "bg-indigo-600 [background-image:var(--replica-gradient-primary)] text-white shadow-[var(--replica-shadow-control)] hover:shadow-[var(--replica-shadow-card-hover)]",
        primary: "bg-indigo-600 [background-image:var(--replica-gradient-primary)] text-white shadow-[var(--replica-shadow-control)] hover:shadow-[var(--replica-shadow-card-hover)]",
        destructive: "bg-(--destructive) text-(--destructive-foreground) shadow-sm hover:bg-(--destructive-hover)",
        danger: "bg-(--destructive) text-(--destructive-foreground) shadow-sm hover:bg-(--destructive-hover)",
        outline: "border border-[var(--replica-border)] bg-white text-[var(--replica-text)] shadow-sm hover:border-indigo-200 hover:bg-indigo-50",
        secondary: "border border-[var(--replica-border)] bg-white text-[var(--replica-text-muted)] shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700",
        ghost: "text-(--foreground) hover:bg-(--secondary)",
        link: "h-auto px-0 text-(--primary) underline-offset-4 hover:text-(--primary-hover) hover:underline",
        premium: "bg-indigo-600 [background-image:var(--replica-gradient-primary)] text-white shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/30",
      },
      size: {
        default: "h-11 min-h-11 px-4 py-2 sm:h-10 sm:min-h-10",
        sm: "h-10 min-h-10 px-3 text-xs sm:h-9 sm:min-h-9",
        lg: "h-12 min-h-12 px-6 text-base sm:h-11 sm:min-h-11",
        icon: "h-11 min-h-11 w-11 sm:h-10 sm:min-h-10 sm:w-10",
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
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const content =
      loading && !asChild ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
