import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import AuroraSmokeLayer from "@/components/visuals/AuroraSmokeLayer";
import CursorReactiveField from "@/components/visuals/CursorReactiveField";
import PageIntensityController from "@/components/visuals/PageIntensityController";
import type { AmbientOwnership, AmbientTone, PageIntensity } from "@/components/visuals/types";

export default function AmbientBackground({
  children,
  intensity = "light",
  tone = "brand",
  ownership = "scoped",
  interactive = intensity === "strong" || intensity === "medium",
  cursorMode = intensity === "strong" ? "hero" : intensity === "medium" ? "panel" : "none",
  backdropMode = intensity === "strong" ? "hero" : intensity === "medium" ? "stage" : "workspace",
  className,
  contentClassName,
}: {
  children: ReactNode;
  intensity?: PageIntensity;
  tone?: AmbientTone;
  ownership?: AmbientOwnership;
  interactive?: boolean;
  cursorMode?: "none" | "hero" | "panel";
  backdropMode?: "stage" | "hero" | "workspace" | "content";
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
      <AuroraSmokeLayer intensity={intensity} tone={tone} backdropMode={backdropMode} />
      {interactive && cursorMode !== "none" ? (
        <CursorReactiveField intensity={intensity} tone={tone} mode={cursorMode} />
      ) : null}
      <div className={cn("ambient-background__content", contentClassName)}>{children}</div>
    </PageIntensityController>
  );
}
