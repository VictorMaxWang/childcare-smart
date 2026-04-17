"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import RevealSection from "@/components/visuals/RevealSection";

export default function MotionHero({
  lead,
  support,
  className,
  leadClassName,
  supportClassName,
}: {
  lead: ReactNode;
  support?: ReactNode;
  className?: string;
  leadClassName?: string;
  supportClassName?: string;
}) {
  return (
    <div className={cn("grid gap-5 lg:grid-cols-[1.04fr_0.96fr] lg:items-stretch", className)}>
      <RevealSection className={cn("h-full", leadClassName)}>{lead}</RevealSection>
      {support ? (
        <RevealSection delay={120} className={cn("h-full", supportClassName)}>
          {support}
        </RevealSection>
      ) : null}
    </div>
  );
}
