"use client";

import { useRef, type ReactNode } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { getRevealTransition } from "@/components/visuals/motion-tokens";
import { cn } from "@/lib/utils";

export default function RevealSection({
  children,
  className,
  delay = 0,
  distance = 18,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { amount: 0.14, once });
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <m.div
      ref={ref}
      initial={{ opacity: 0, y: distance, filter: "blur(12px)" }}
      animate={
        isInView
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : undefined
      }
      transition={getRevealTransition(delay)}
      className={cn("will-change-transform", className)}
    >
      {children}
    </m.div>
  );
}

export { RevealSection as SectionReveal };
