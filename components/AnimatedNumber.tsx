"use client";

import { useEffect, useMemo, useState } from "react";

export default function AnimatedNumber({
  value,
  duration = 800,
  suffix = "",
  decimals = 0,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let startTime = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, value]);

  const formatted = useMemo(() => {
    return `${displayValue.toFixed(decimals)}${suffix}`;
  }, [decimals, displayValue, suffix]);

  return <span>{formatted}</span>;
}