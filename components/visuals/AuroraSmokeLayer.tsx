import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AmbientTone, PageIntensity } from "@/components/visuals/types";

const CANONICAL_TONE = {
  "--aurora-a": "rgba(118, 108, 255, 0.3)",
  "--aurora-b": "rgba(90, 112, 255, 0.22)",
  "--aurora-c": "rgba(176, 132, 255, 0.2)",
  "--aurora-d": "rgba(230, 236, 255, 0.1)",
  "--aurora-mist": "rgba(132, 122, 255, 0.12)",
} as CSSProperties;

const tonePalette: Record<AmbientTone, CSSProperties> = {
  brand: CANONICAL_TONE,
  warm: CANONICAL_TONE,
  calm: CANONICAL_TONE,
};

const intensityClassMap: Record<PageIntensity, string> = {
  strong: "aurora-smoke-layer-strong",
  medium: "aurora-smoke-layer-medium",
  light: "aurora-smoke-layer-light",
  dense: "aurora-smoke-layer-dense",
};

export default function AuroraSmokeLayer({
  intensity = "light",
  tone = "brand",
  backdropMode = "stage",
  className,
}: {
  intensity?: PageIntensity;
  tone?: AmbientTone;
  backdropMode?: "stage" | "hero" | "workspace" | "content";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("aurora-smoke-layer", intensityClassMap[intensity], className)}
      style={tonePalette[tone]}
      data-backdrop-mode={backdropMode}
    >
      <span className="aurora-smoke aurora-smoke-band aurora-smoke-band-a" />
      <span className="aurora-smoke aurora-smoke-band aurora-smoke-band-b" />
      <span className="aurora-smoke aurora-smoke-orb aurora-smoke-orb-a" />
      <span className="aurora-smoke aurora-smoke-orb aurora-smoke-orb-b" />
      <span className="aurora-smoke aurora-smoke-orb aurora-smoke-orb-c" />
    </div>
  );
}
