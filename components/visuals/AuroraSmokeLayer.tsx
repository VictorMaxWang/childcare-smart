import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AmbientTone, PageIntensity } from "@/components/visuals/types";

const tonePalette: Record<AmbientTone, CSSProperties> = {
  brand: {
    "--aurora-a": "rgba(99, 102, 241, 0.24)",
    "--aurora-b": "rgba(14, 165, 233, 0.18)",
    "--aurora-c": "rgba(124, 58, 237, 0.15)",
    "--aurora-d": "rgba(251, 191, 36, 0.12)",
  } as CSSProperties,
  warm: {
    "--aurora-a": "rgba(245, 158, 11, 0.22)",
    "--aurora-b": "rgba(251, 146, 60, 0.18)",
    "--aurora-c": "rgba(236, 72, 153, 0.15)",
    "--aurora-d": "rgba(56, 189, 248, 0.12)",
  } as CSSProperties,
  calm: {
    "--aurora-a": "rgba(56, 189, 248, 0.18)",
    "--aurora-b": "rgba(45, 212, 191, 0.16)",
    "--aurora-c": "rgba(129, 140, 248, 0.12)",
    "--aurora-d": "rgba(148, 163, 184, 0.1)",
  } as CSSProperties,
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
  className,
}: {
  intensity?: PageIntensity;
  tone?: AmbientTone;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("aurora-smoke-layer", intensityClassMap[intensity], className)}
      style={tonePalette[tone]}
    >
      <span className="aurora-smoke aurora-smoke-a" />
      <span className="aurora-smoke aurora-smoke-b" />
      <span className="aurora-smoke aurora-smoke-c" />
      <span className="aurora-smoke aurora-smoke-d" />
    </div>
  );
}
