export type PageIntensity = "strong" | "medium" | "light" | "dense";

export type AmbientTone = "brand" | "warm" | "calm";

export type SurfaceTone = AmbientTone;

export type SurfaceVariant = "solid" | "glass" | "luminous";

export type AmbientOwnership = "scoped" | "global";

export type RouteVisualMode = "global" | "scoped" | "utility";

export type RouteTransitionStyle = "cinematic" | "subtle";

export interface RouteVisualProfile {
  mode: RouteVisualMode;
  intensity: PageIntensity;
  tone: AmbientTone;
  interactive: boolean;
  transition: RouteTransitionStyle;
}
