"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function MagneticCTA({
  className,
  children,
  strength = 12,
  disabled = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  strength?: number;
  disabled?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.style.setProperty("--magnetic-x", "0px");
    wrapper.style.setProperty("--magnetic-y", "0px");
  }, []);

  const enableMagnetic = !disabled && !prefersReducedMotion;

  return (
    <div
      ref={wrapperRef}
      className={cn("magnetic-cta", enableMagnetic ? "magnetic-cta-active" : null, className)}
      onPointerMove={
        enableMagnetic
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const offsetX = ((event.clientX - rect.left) / rect.width - 0.5) * strength * 2;
              const offsetY = ((event.clientY - rect.top) / rect.height - 0.5) * strength * 2;
              event.currentTarget.style.setProperty("--magnetic-x", `${offsetX.toFixed(2)}px`);
              event.currentTarget.style.setProperty("--magnetic-y", `${offsetY.toFixed(2)}px`);
            }
          : undefined
      }
      onPointerLeave={
        enableMagnetic
          ? (event) => {
              event.currentTarget.style.setProperty("--magnetic-x", "0px");
              event.currentTarget.style.setProperty("--magnetic-y", "0px");
            }
          : undefined
      }
      {...props}
    >
      {children}
    </div>
  );
}
