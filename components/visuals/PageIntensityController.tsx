import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { PageIntensity } from "@/components/visuals/types";

const intensityClassMap: Record<PageIntensity, string> = {
  strong: "page-frame-strong",
  medium: "page-frame-medium",
  light: "page-frame-light",
  dense: "page-frame-dense",
};

export default function PageIntensityController({
  intensity = "light",
  interactive = intensity === "strong" || intensity === "medium",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  intensity?: PageIntensity;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "page-intensity-controller",
        intensityClassMap[intensity],
        interactive ? "page-frame-interactive" : "page-frame-static",
        className
      )}
      data-page-intensity={intensity}
      {...props}
    />
  );
}
