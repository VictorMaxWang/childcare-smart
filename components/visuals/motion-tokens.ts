import type { Transition } from "framer-motion";
import type { RouteTransitionStyle } from "@/components/visuals/types";

export const MOTION_EASE_STANDARD = [0.22, 1, 0.36, 1] as const;
export const MOTION_EASE_REDUCED = [0.33, 0, 0.67, 1] as const;

export const MOTION_DURATION_MS = {
  routeReduced: 160,
  routeSubtle: 280,
  routeCinematic: 420,
  reveal: 620,
  cursorFade: 260,
  magnetic: 240,
} as const;

export function getRouteTransitionMotion(input: {
  prefersReducedMotion: boolean;
  constrained: boolean;
  transitionStyle: RouteTransitionStyle;
}) {
  if (input.prefersReducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: {
        duration: MOTION_DURATION_MS.routeReduced / 1000,
        ease: MOTION_EASE_REDUCED,
      } satisfies Transition,
    };
  }

  const subtle = input.transitionStyle === "subtle" || input.constrained;

  return {
    initial: {
      opacity: 0,
      y: subtle ? 6 : 12,
      filter: subtle ? "blur(8px)" : "blur(16px)",
      scale: subtle ? 1 : 0.996,
    },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
    },
    exit: {
      opacity: 0,
      y: subtle ? -4 : -10,
      filter: subtle ? "blur(6px)" : "blur(12px)",
      scale: subtle ? 1 : 1.002,
    },
    transition: {
      duration: (subtle ? MOTION_DURATION_MS.routeSubtle : MOTION_DURATION_MS.routeCinematic) / 1000,
      ease: MOTION_EASE_STANDARD,
    } satisfies Transition,
  };
}

export function getRevealTransition(delayMs = 0): Transition {
  return {
    duration: MOTION_DURATION_MS.reveal / 1000,
    delay: delayMs / 1000,
    ease: MOTION_EASE_STANDARD,
  };
}
