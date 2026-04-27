import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "size"> {
  label: string;
  children: React.ReactNode;
  size?: "sm" | "default" | "lg";
}

const iconButtonSizeMap = {
  sm: "h-9 w-9",
  default: "h-10 w-10",
  lg: "h-11 w-11",
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, className, size = "default", ...props }, ref) => (
    <Button
      ref={ref}
      size="icon"
      aria-label={label}
      title={label}
      className={cn(iconButtonSizeMap[size], className)}
      {...props}
    >
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  )
);
IconButton.displayName = "IconButton";

export { IconButton };
