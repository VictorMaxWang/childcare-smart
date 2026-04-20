"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ParentCareFocusTone = "sky" | "amber" | "emerald" | "slate";

type ParentCareFocusItem = {
  label: string;
  value: string;
  tone?: ParentCareFocusTone;
};

interface ParentCareFocusCardProps {
  title: string;
  description?: string;
  badge?: string;
  items: ParentCareFocusItem[];
  actions?: ReactNode;
  className?: string;
}

const toneClassMap: Record<ParentCareFocusTone, string> = {
  sky: "border-white/12 border-l-4 border-l-blue-300 bg-white/6",
  amber: "border-white/12 border-l-4 border-l-violet-300 bg-white/6",
  emerald: "border-white/12 border-l-4 border-l-violet-200 bg-white/6",
  slate: "border-white/12 border-l-4 border-l-indigo-300 bg-white/6",
};

export default function ParentCareFocusCard({
  title,
  description,
  badge,
  items,
  actions,
  className,
}: ParentCareFocusCardProps) {
  return (
    <section
      className={cn(
        "content-focus-block rounded-[32px] border border-white/14 p-5 shadow-[var(--shadow-card-strong)] sm:p-6",
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-3">
          {badge ? (
            <Badge variant="info" className="px-3 py-1 text-sm">
              {badge}
            </Badge>
          ) : null}
          <div>
            <h2 className="text-2xl font-semibold leading-10 text-slate-950 sm:text-3xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-3 text-base leading-8 text-slate-700">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={cn(
                "rounded-[24px] border p-4 backdrop-blur-xl",
                toneClassMap[item.tone ?? "slate"]
              )}
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-3 text-lg font-semibold leading-8 text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {actions ? <div className="flex flex-col gap-3 sm:flex-row">{actions}</div> : null}
      </div>
    </section>
  );
}
