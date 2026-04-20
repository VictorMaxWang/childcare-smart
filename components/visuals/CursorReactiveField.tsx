"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AmbientTone, PageIntensity } from "@/components/visuals/types";

type CursorMode = "hero" | "panel";

const toneClassMap: Record<AmbientTone, string> = {
  brand: "cursor-reactive-field-brand",
  warm: "cursor-reactive-field-brand",
  calm: "cursor-reactive-field-brand",
};

export default function CursorReactiveField({
  intensity = "medium",
  tone = "brand",
  mode = intensity === "strong" ? "hero" : "panel",
  className,
}: {
  intensity?: PageIntensity;
  tone?: AmbientTone;
  mode?: CursorMode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    const host = field?.parentElement;

    if (!field || !host || prefersReducedMotion || intensity === "dense" || intensity === "light") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mediaQuery.matches) {
      return;
    }

    let frame = 0;
    let targetX = 50;
    let targetY = 50;
    let targetOpacity = 0;
    let currentX = 50;
    let currentY = 50;
    let currentOpacity = 0;
    let lastPointerMove = 0;

    const followStrength = mode === "hero" ? 0.12 : 0.18;
    const opacityStrength = mode === "hero" ? 0.14 : 0.2;
    const idleAfterMs = mode === "hero" ? 160 : 120;

    const commit = () => {
      field.style.setProperty("--cursor-x", `${currentX.toFixed(2)}%`);
      field.style.setProperty("--cursor-y", `${currentY.toFixed(2)}%`);
      field.style.setProperty("--cursor-opacity", currentOpacity.toFixed(3));
    };

    const tick = () => {
      const now = performance.now();

      if (targetOpacity > 0 && now - lastPointerMove > idleAfterMs) {
        targetOpacity = 0.72;
      }

      currentX += (targetX - currentX) * followStrength;
      currentY += (targetY - currentY) * followStrength;
      currentOpacity += (targetOpacity - currentOpacity) * opacityStrength;

      commit();

      const settled =
        Math.abs(targetX - currentX) < 0.03 &&
        Math.abs(targetY - currentY) < 0.03 &&
        Math.abs(targetOpacity - currentOpacity) < 0.02;

      if (!settled) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      currentX = targetX;
      currentY = targetY;
      currentOpacity = targetOpacity;
      commit();
      frame = 0;
    };

    const ensureFrame = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const moveField = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const relativeX = ((event.clientX - rect.left) / rect.width) * 100;
      const relativeY = ((event.clientY - rect.top) / rect.height) * 100;

      targetX = Math.max(0, Math.min(relativeX, 100));
      targetY = Math.max(0, Math.min(relativeY, 100));
      targetOpacity = 1;
      lastPointerMove = performance.now();
      ensureFrame();
    };

    const hideField = () => {
      targetOpacity = 0;
      ensureFrame();
    };

    host.addEventListener("pointermove", moveField, { passive: true });
    host.addEventListener("pointerleave", hideField);
    window.addEventListener("blur", hideField);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      host.removeEventListener("pointermove", moveField);
      host.removeEventListener("pointerleave", hideField);
      window.removeEventListener("blur", hideField);
    };
  }, [intensity, mode, prefersReducedMotion]);

  if (prefersReducedMotion || intensity === "dense" || intensity === "light") {
    return null;
  }

  return (
    <div
      ref={fieldRef}
      aria-hidden="true"
      className={cn("cursor-reactive-field", `cursor-reactive-field--${mode}`, toneClassMap[tone], className)}
    />
  );
}
