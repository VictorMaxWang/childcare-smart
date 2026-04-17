import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import AuroraSmokeLayer from "@/components/visuals/AuroraSmokeLayer";
import CursorReactiveGlow from "@/components/visuals/CursorReactiveGlow";
import PageIntensityController from "@/components/visuals/PageIntensityController";
import type { AmbientOwnership, AmbientTone, PageIntensity } from "@/components/visuals/types";

export default function AmbientBackground({
  children,
  intensity = "light",
  tone = "brand",
  ownership = "scoped",
  interactive = intensity === "strong" || intensity === "medium",
  className,
  contentClassName,
}: {
  children: ReactNode;
  intensity?: PageIntensity;
  tone?: AmbientTone;
  ownership?: AmbientOwnership;
  interactive?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <PageIntensityController
      intensity={intensity}
      interactive={interactive}
      className={cn(
        "ambient-background",
        ownership === "global" ? "ambient-background-global" : "ambient-background-scoped",
        className
      )}
      data-ambient-scope={ownership}
      data-ambient-tone={tone}
    >
      <AuroraSmokeLayer intensity={intensity} tone={tone} />
      {interactive ? <CursorReactiveGlow intensity={intensity} tone={tone} /> : null}
      <div className={cn("ambient-background__content", contentClassName)}>{children}</div>
    </PageIntensityController>
  );
}
