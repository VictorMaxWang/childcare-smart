"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TeacherPixelTone = "violet" | "blue" | "cyan" | "green" | "amber" | "orange" | "red" | "slate";

const toneSurface: Record<TeacherPixelTone, string> = {
  violet: "border-violet-100 bg-violet-50 text-violet-700",
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  cyan: "border-cyan-100 bg-cyan-50 text-cyan-700",
  green: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  orange: "border-orange-100 bg-orange-50 text-orange-700",
  red: "border-rose-100 bg-rose-50 text-rose-700",
  slate: "border-slate-100 bg-slate-50 text-slate-600",
};

const toneGlow: Record<TeacherPixelTone, string> = {
  violet: "bg-[radial-gradient(circle_at_70%_30%,#ede9fe_0,#ffffff_62%)]",
  blue: "bg-[radial-gradient(circle_at_70%_30%,#dbeafe_0,#ffffff_62%)]",
  cyan: "bg-[radial-gradient(circle_at_70%_30%,#cffafe_0,#ffffff_62%)]",
  green: "bg-[radial-gradient(circle_at_70%_30%,#d1fae5_0,#ffffff_62%)]",
  amber: "bg-[radial-gradient(circle_at_70%_30%,#fef3c7_0,#ffffff_62%)]",
  orange: "bg-[radial-gradient(circle_at_70%_30%,#ffedd5_0,#ffffff_62%)]",
  red: "bg-[radial-gradient(circle_at_70%_30%,#ffe4e6_0,#ffffff_62%)]",
  slate: "bg-white",
};

export function PixelPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.35rem] border border-[#e2e9f6] bg-white/94 shadow-[0_18px_54px_rgb(70_88_140_/_0.07)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function PixelSectionTitle({
  title,
  meta,
  action,
  className,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[1.05rem] font-bold leading-6 text-[#172345]">{title}</h2>
        {meta ? <div className="mt-1 text-xs font-medium text-[#7a86a4]">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PixelIconBubble({
  icon,
  tone = "violet",
  className,
}: {
  icon: ReactNode;
  tone?: TeacherPixelTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.05rem] border shadow-[0_12px_26px_rgb(70_88_140_/_0.08)]",
        toneSurface[tone],
        className
      )}
    >
      {icon}
    </span>
  );
}

export function PixelMetricCard({
  label,
  value,
  subLabel,
  icon,
  tone = "violet",
  className,
}: {
  label: string;
  value: string;
  subLabel?: string;
  icon: ReactNode;
  tone?: TeacherPixelTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[4.9rem] rounded-[1rem] border border-[#e4ebf7] p-3 shadow-[0_12px_30px_rgb(70_88_140_/_0.045)]",
        toneGlow[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#5f6d8d]">{label}</p>
          <p className="mt-1.5 text-2xl font-bold leading-none text-[#172345]">{value}</p>
          {subLabel ? <p className="mt-1.5 text-xs font-medium text-[#8a96b2]">{subLabel}</p> : null}
        </div>
        <PixelIconBubble icon={icon} tone={tone} className="h-11 w-11 rounded-[0.95rem]" />
      </div>
    </div>
  );
}

export function PixelQuickLink({
  href,
  icon,
  title,
  subtitle,
  tone = "violet",
  className,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone?: TeacherPixelTone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[4.5rem] items-center gap-1.5 rounded-[0.9rem] border border-[#e4ebf7] p-2 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_18px_34px_rgb(99_102_241_/_0.10)]",
        toneGlow[tone],
        className
      )}
    >
      <PixelIconBubble icon={icon} tone={tone} className="h-8 w-8 rounded-[0.7rem] [&>svg]:h-4 [&>svg]:w-4" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#172345]">{title}</p>
        <p className="mt-1 truncate text-xs font-medium text-[#7a86a4]">{subtitle}</p>
      </div>
      <ArrowRight className="hidden h-4 w-4 shrink-0 text-[#9aa6c1] transition group-hover:translate-x-0.5 group-hover:text-violet-500 2xl:block" />
    </Link>
  );
}

export function PixelTaskRow({
  title,
  detail,
  status,
  tone = "violet",
  checked = false,
}: {
  title: string;
  detail: string;
  status: string;
  tone?: TeacherPixelTone;
  checked?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-[#edf1f8] py-2 last:border-b-0">
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 items-center justify-center rounded-[0.25rem] border",
          checked ? "border-emerald-400 bg-emerald-400 text-white" : "border-[#cfd8ea] bg-white"
        )}
      >
        {checked ? <CheckCircle2 className="h-3 w-3" /> : null}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", tone === "red" ? "bg-rose-500" : tone === "blue" ? "bg-blue-500" : tone === "amber" ? "bg-amber-500" : tone === "green" ? "bg-emerald-500" : "bg-violet-500")} />
          <p className="truncate text-sm font-bold text-[#233154]">{title}</p>
        </div>
        <p className="truncate text-xs font-medium text-[#7b87a5]">{detail}</p>
      </div>
      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", toneSurface[tone])}>{status}</span>
    </div>
  );
}

export function PixelTextButton({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-violet-600">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
