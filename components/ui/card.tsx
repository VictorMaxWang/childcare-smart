import * as React from "react";
import { cn } from "@/lib/utils";
import type { SurfaceTone } from "@/components/visuals/types";

type CardSurface = "solid" | "glass" | "luminous";
type CardGlow = "none" | "soft" | "brand";

const surfaceClassMap: Record<CardSurface, string> = {
  solid: "surface-solid",
  glass: "surface-glass",
  luminous: "surface-luminous",
};

const toneClassMap: Record<SurfaceTone, string> = {
  brand: "surface-tone-brand",
  warm: "surface-tone-warm",
  calm: "surface-tone-calm",
};

const glowClassMap: Record<CardGlow, string> = {
  none: "",
  soft: "surface-glow-soft",
  brand: "surface-glow-brand",
};

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    surface?: CardSurface;
    tone?: SurfaceTone;
    glow?: CardGlow;
    interactive?: boolean;
  }
>(({ className, surface = "solid", tone = "brand", glow = "soft", interactive = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "premium-card rounded-[1.6rem] border text-(--card-foreground)",
        surfaceClassMap[surface],
        toneClassMap[tone],
        glowClassMap[glow],
        interactive ? "interactive-lift" : null,
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-(--muted-foreground)", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
