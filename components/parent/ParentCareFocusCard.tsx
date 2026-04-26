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
  sky: "border-sky-100 bg-sky-50/80",
  amber: "border-amber-100 bg-amber-50/80",
  emerald: "border-emerald-100 bg-emerald-50/80",
  slate: "border-slate-100 bg-slate-50/90",
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
        "rounded-[32px] border border-indigo-100 bg-linear-to-br from-white via-indigo-50/60 to-sky-50/70 p-5 shadow-[0_18px_50px_rgba(79,70,229,0.12)] sm:p-6",
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
                "rounded-[24px] border p-4",
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
