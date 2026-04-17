"use client";

import type { ReactNode } from "react";
import RevealSection from "@/components/visuals/RevealSection";

export default function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <RevealSection className={className} delay={delay}>
      {children}
    </RevealSection>
  );
}
