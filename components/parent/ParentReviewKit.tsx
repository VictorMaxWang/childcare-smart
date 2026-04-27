"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Baby, CalendarCheck2, HeartPulse, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ParentTone = "sky" | "emerald" | "amber" | "rose" | "indigo" | "slate";

type ParentStatusVariant = "success" | "warning" | "info" | "secondary" | "outline";

const toneSurfaceClassMap: Record<ParentTone, string> = {
  sky: "border-sky-100 bg-sky-50 text-sky-800",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
  amber: "border-amber-100 bg-amber-50 text-amber-800",
  rose: "border-rose-100 bg-rose-50 text-rose-800",
  indigo: "border-indigo-100 bg-indigo-50 text-indigo-800",
  slate: "border-slate-100 bg-slate-50 text-slate-700",
};

const toneDotClassMap: Record<ParentTone, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
  slate: "bg-slate-400",
};

export interface ParentStatusPill {
  label: string;
  value: ReactNode;
  tone?: ParentTone;
}

export interface ParentHeroCardProps {
  eyebrow: string;
  title: string;
  description: string;
  childName: string;
  childMeta: string;
  allergies: string[];
  statusLabel: string;
  statusVariant?: ParentStatusVariant;
  pills: ParentStatusPill[];
  actions?: ReactNode;
  className?: string;
}

export function ParentHeroCard({
  eyebrow,
  title,
  description,
  childName,
  childMeta,
  allergies,
  statusLabel,
  statusVariant = "info",
  pills,
  actions,
  className,
}: ParentHeroCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm",
        className
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" className="px-3 py-1">
              {eyebrow}
            </Badge>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-9 text-slate-950 sm:text-3xl sm:leading-10">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
              {description}
            </p>
          </div>
          {actions ? <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div> : null}
        </div>

        <div className="border-t border-indigo-100 bg-linear-to-br from-indigo-50 via-white to-sky-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="rounded-2xl border border-white/80 bg-white/86 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Baby className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-slate-950">{childName}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{childMeta}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allergies.length > 0 ? (
                    allergies.map((item) => (
                      <Badge key={item} variant="warning">
                        过敏：{item}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="success">暂无过敏重点</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {pills.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "rounded-xl border px-3 py-3",
                    toneSurfaceClassMap[item.tone ?? "slate"]
                  )}
                >
                  <p className="text-xs opacity-80">{item.label}</p>
                  <div className="mt-1 text-base font-semibold text-slate-950">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export interface ParentTimelineItem {
  id: string;
  title: string;
  meta: string;
  description: ReactNode;
  tone?: ParentTone;
  icon?: ReactNode;
  status?: string;
  statusVariant?: ParentStatusVariant;
}

export interface ParentTimelineCardProps {
  title: string;
  description?: string;
  items: ParentTimelineItem[];
  emptyText?: string;
}

export function ParentTimelineCard({
  title,
  description,
  items,
  emptyText = "当前还没有可展示的记录。",
}: ParentTimelineCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <CalendarCheck2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-white",
                    toneDotClassMap[item.tone ?? "slate"]
                  )}
                >
                  {item.icon ?? <span className="h-2 w-2 rounded-full bg-white" />}
                </div>
                <div className="mt-2 h-full min-h-6 w-px bg-slate-200" />
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                  </div>
                  {item.status ? <Badge variant={item.statusVariant ?? "secondary"}>{item.status}</Badge> : null}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{item.description}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

export interface ParentWeeklySignal {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: ParentTone;
}

export function ParentWeeklySignalGrid({ items }: { items: ParentWeeklySignal[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-2xl border p-4 shadow-sm",
            toneSurfaceClassMap[item.tone ?? "slate"]
          )}
        >
          <p className="text-xs opacity-80">{item.label}</p>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-950">{item.value}</div>
          {item.helper ? <p className="mt-2 text-xs leading-5 text-slate-600">{item.helper}</p> : null}
        </div>
      ))}
    </div>
  );
}

export interface ParentActionCardProps {
  title: string;
  description: string;
  href?: string;
  icon?: ReactNode;
  tone?: ParentTone;
  actionLabel?: string;
  children?: ReactNode;
}

export function ParentActionCard({
  title,
  description,
  href,
  icon,
  tone = "indigo",
  actionLabel,
  children,
}: ParentActionCardProps) {
  const content = (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            toneSurfaceClassMap[tone]
          )}
        >
          {icon ?? <Sparkles className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {children ? <div>{children}</div> : null}
      {href ? (
        <div className="mt-auto flex items-center gap-2 text-sm font-semibold text-indigo-700">
          {actionLabel ?? "查看详情"}
          <ArrowRight className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  ) : (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</div>
  );
}

export function ParentGentleNotice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
