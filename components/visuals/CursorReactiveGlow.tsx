"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AmbientTone, PageIntensity } from "@/components/visuals/types";

const toneClassMap: Record<AmbientTone, string> = {
  brand: "cursor-reactive-glow-brand",
  warm: "cursor-reactive-glow-warm",
  calm: "cursor-reactive-glow-calm",
};

export default function CursorReactiveGlow({
  intensity = "medium",
  tone = "brand",
  className,
}: {
  intensity?: PageIntensity;
  tone?: AmbientTone;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow || prefersReducedMotion || intensity === "dense" || intensity === "light") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mediaQuery.matches) {
      return;
    }

    let frame = 0;

    const moveGlow = (event: PointerEvent) => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        glow.style.setProperty("--cursor-x", `${event.clientX}px`);
        glow.style.setProperty("--cursor-y", `${event.clientY}px`);
        glow.style.setProperty("--cursor-opacity", "1");
      });
    };

    const hideGlow = () => {
      glow.style.setProperty("--cursor-opacity", "0");
    };

    window.addEventListener("pointermove", moveGlow, { passive: true });
    window.addEventListener("pointerleave", hideGlow);
    window.addEventListener("blur", hideGlow);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("pointermove", moveGlow);
      window.removeEventListener("pointerleave", hideGlow);
      window.removeEventListener("blur", hideGlow);
    };
  }, [intensity, prefersReducedMotion]);

  if (prefersReducedMotion || intensity === "dense" || intensity === "light") {
    return null;
  }

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className={cn("cursor-reactive-glow", toneClassMap[tone], className)}
    />
  );
}
