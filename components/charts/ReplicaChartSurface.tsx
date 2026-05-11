"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ReplicaChartSurface({
  children,
  height,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
  height: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const nextWidth = Math.floor(rect.width);
        const nextHeight = Math.floor(rect.height || height);
        setSize((current) =>
          current.width === nextWidth && current.height === nextHeight
            ? current
            : { width: Math.max(0, nextWidth), height: Math.max(0, nextHeight) }
        );
      });
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", update);
      };
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height]);

  return (
    <div ref={ref} className="w-full min-w-0" style={{ height }}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}
