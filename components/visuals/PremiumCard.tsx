import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import GlassSurface from "@/components/visuals/GlassSurface";
import type { SurfaceTone, SurfaceVariant } from "@/components/visuals/types";

const glowClassMap = {
  none: "",
  soft: "surface-glow-soft",
  brand: "surface-glow-brand",
} satisfies Record<"none" | "soft" | "brand", string>;

export default function PremiumCard({
  surface = "glass",
  tone = "brand",
  glow = "soft",
  interactive = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  surface?: SurfaceVariant;
  tone?: SurfaceTone;
  glow?: keyof typeof glowClassMap;
  interactive?: boolean;
}) {
  return (
    <GlassSurface
      surface={surface}
      tone={tone}
      className={cn(
        "premium-card",
        glowClassMap[glow],
        interactive ? "interactive-lift" : null,
        className
      )}
      {...props}
    />
  );
}
