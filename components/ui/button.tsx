import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 data-[loading=true]:cursor-wait active:scale-[0.99]",
  {
    variants: {
      variant: {
        default: "bg-(--primary) text-(--primary-foreground) shadow-sm hover:bg-(--primary-hover) hover:shadow-md",
        primary: "bg-(--primary) text-(--primary-foreground) shadow-sm hover:bg-(--primary-hover) hover:shadow-md",
        destructive: "bg-(--destructive) text-(--destructive-foreground) shadow-sm hover:bg-(--destructive-hover)",
        danger: "bg-(--destructive) text-(--destructive-foreground) shadow-sm hover:bg-(--destructive-hover)",
        outline: "border border-(--border) bg-white text-(--foreground) shadow-sm hover:border-(--input-hover) hover:bg-(--hover-surface)",
        secondary: "bg-(--secondary) text-(--secondary-foreground) hover:bg-slate-200/70",
        ghost: "text-(--foreground) hover:bg-(--secondary)",
        link: "h-auto px-0 text-(--primary) underline-offset-4 hover:text-(--primary-hover) hover:underline",
        premium: "bg-linear-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25 hover:from-indigo-600 hover:to-violet-600 hover:shadow-lg hover:shadow-indigo-500/30",
      },
      size: {
        default: "h-11 min-h-11 px-4 py-2 sm:h-10 sm:min-h-10",
        sm: "h-10 min-h-10 rounded-md px-3 text-xs sm:h-9 sm:min-h-9",
        lg: "h-12 min-h-12 rounded-md px-6 text-base sm:h-11 sm:min-h-11",
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
