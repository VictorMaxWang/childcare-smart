"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusTag, type StatusTagVariant } from "@/components/ui/status-tag";
import { cn } from "@/lib/utils";

type TeacherTone = "indigo" | "sky" | "emerald" | "amber" | "rose" | "slate";

const surfaceToneMap: Record<TeacherTone, string> = {
  indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-700",
  sky: "border-sky-100 bg-sky-50/70 text-sky-700",
  emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  amber: "border-amber-100 bg-amber-50/70 text-amber-700",
  rose: "border-rose-100 bg-rose-50/70 text-rose-700",
  slate: "border-slate-100 bg-slate-50/80 text-slate-700",
};

const softSurfaceToneMap: Record<TeacherTone, string> = {
  indigo: "border-indigo-100 bg-linear-to-br from-indigo-50 via-white to-sky-50",
  sky: "border-sky-100 bg-linear-to-br from-sky-50 via-white to-indigo-50",
  emerald: "border-emerald-100 bg-linear-to-br from-emerald-50 via-white to-teal-50",
  amber: "border-amber-100 bg-linear-to-br from-amber-50 via-white to-indigo-50",
  rose: "border-rose-100 bg-linear-to-br from-rose-50 via-white to-amber-50",
  slate: "border-slate-100 bg-white",
};

export function TeacherActionTile({
  href,
  icon,
  title,
  description,
  tone = "indigo",
  highlight = false,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  tone?: TeacherTone;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-32 flex-col justify-between rounded-lg border p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]",
        softSurfaceToneMap[tone],
        highlight ? "ring-1 ring-indigo-100" : ""
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg border", surfaceToneMap[tone])}>
          {icon}
        </span>
        <ArrowRight className="mt-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
      </div>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </Link>
  );
}

export function TeacherTaskRow({
  title,
  detail,
  meta,
  status,
  statusVariant = "neutral",
  tone = "slate",
}: {
  title: string;
  detail: string;
  meta?: string;
  status: string;
  statusVariant?: StatusTagVariant;
  tone?: TeacherTone;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          {meta ? <p className="mt-1 text-xs text-slate-400">{meta}</p> : null}
        </div>
        <StatusTag variant={statusVariant} showDot>
          {status}
        </StatusTag>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
      <div className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", surfaceToneMap[tone])}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        今日跟进
      </div>
    </div>
  );
}

export function TeacherContextStrip({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: TeacherTone }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-100 bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <span className={cn("h-2 w-2 rounded-full", item.tone === "rose" ? "bg-rose-400" : item.tone === "amber" ? "bg-amber-400" : item.tone === "emerald" ? "bg-emerald-400" : item.tone === "sky" ? "bg-sky-400" : "bg-indigo-400")} />
          </div>
          <p className="mt-2 text-2xl font-semibold leading-tight text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function TeacherMiniPanel({
  title,
  children,
  badge,
  tone = "slate",
}: {
  title: string;
  children: ReactNode;
  badge?: string;
  tone?: TeacherTone;
}) {
  return (
    <div className={cn("rounded-lg border p-4", softSurfaceToneMap[tone])}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
