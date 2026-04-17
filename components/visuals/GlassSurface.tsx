import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { SurfaceTone, SurfaceVariant } from "@/components/visuals/types";

const surfaceClassMap: Record<SurfaceVariant, string> = {
  solid: "surface-solid",
  glass: "surface-glass",
  luminous: "surface-luminous",
};

const toneClassMap: Record<SurfaceTone, string> = {
  brand: "surface-tone-brand",
  warm: "surface-tone-warm",
  calm: "surface-tone-calm",
};

export default function GlassSurface({
  surface = "glass",
  tone = "brand",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  surface?: SurfaceVariant;
  tone?: SurfaceTone;
}) {
  return (
    <div
      className={cn("glass-surface", surfaceClassMap[surface], toneClassMap[tone], className)}
      {...props}
    />
  );
}
