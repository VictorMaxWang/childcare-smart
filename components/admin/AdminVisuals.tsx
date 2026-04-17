import type { HTMLAttributes, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import GlassSurface from "@/components/visuals/GlassSurface";
import { cn } from "@/lib/utils";

export type AdminTone = "slate" | "indigo" | "sky" | "amber" | "emerald" | "rose";

const bandToneClassMap: Record<AdminTone, string> = {
  slate:
    "border-slate-200/80 bg-linear-to-r from-white via-slate-50/80 to-white",
  indigo:
    "border-indigo-100/80 bg-linear-to-r from-indigo-50/90 via-white to-sky-50/70",
  sky: "border-sky-100/80 bg-linear-to-r from-sky-50/90 via-white to-indigo-50/60",
  amber:
    "border-amber-100/80 bg-linear-to-r from-amber-50/90 via-white to-rose-50/60",
  emerald:
    "border-emerald-100/80 bg-linear-to-r from-emerald-50/90 via-white to-teal-50/60",
  rose: "border-rose-100/80 bg-linear-to-r from-rose-50/90 via-white to-amber-50/55",
};

const subsectionToneClassMap: Record<AdminTone, string> = {
  slate: "border-slate-200/80 bg-white/90",
  indigo: "border-indigo-100/85 bg-indigo-50/40",
  sky: "border-sky-100/85 bg-sky-50/45",
  amber: "border-amber-100/85 bg-amber-50/55",
  emerald: "border-emerald-100/85 bg-emerald-50/45",
  rose: "border-rose-100/85 bg-rose-50/50",
};

const itemToneClassMap: Record<AdminTone, string> = {
  slate: "border-slate-200/80 bg-white/86",
  indigo: "border-indigo-100/75 bg-indigo-50/45",
  sky: "border-sky-100/75 bg-sky-50/50",
  amber: "border-amber-100/75 bg-amber-50/60",
  emerald: "border-emerald-100/75 bg-emerald-50/50",
  rose: "border-rose-100/75 bg-rose-50/55",
};

const accentToneClassMap: Record<AdminTone, string> = {
  slate: "bg-slate-400/75",
  indigo: "bg-indigo-400/80",
  sky: "bg-sky-400/80",
  amber: "bg-amber-400/85",
  emerald: "bg-emerald-400/80",
  rose: "bg-rose-400/80",
};

export function AdminBand({
  eyebrow,
  title,
  description,
  actions,
  children,
  tone = "slate",
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <GlassSurface
      surface="luminous"
      className={cn(
        "relative overflow-hidden rounded-[1.9rem] border p-5 shadow-[var(--shadow-card)]",
        bandToneClassMap[tone],
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-white/0 via-white/90 to-white/0" />
      <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow ? <div className="flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
          {title ? (
            <p className="text-lg font-semibold tracking-tight text-slate-950">{title}</p>
          ) : null}
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
          {children}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">{actions}</div> : null}
      </div>
    </GlassSurface>
  );
}

export function AdminSubsection({
  title,
  description,
  actions,
  children,
  tone = "slate",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border p-5",
        subsectionToneClassMap[tone],
        className
      )}
    >
      {title || description || actions ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <p className="text-sm font-semibold text-slate-950">{title}</p> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function AdminDataItem({
  title,
  description,
  badge,
  meta,
  footer,
  children,
  tone = "slate",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border px-4 py-4",
        itemToneClassMap[tone],
        className
      )}
    >
      {title || badge ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <p className="text-sm font-semibold text-slate-950">{title}</p> : null}
            {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      ) : null}
      {!title && description ? <p className="text-sm leading-6 text-slate-600">{description}</p> : null}
      {meta ? <div className="mt-3 text-xs leading-5 text-slate-500">{meta}</div> : null}
      {children ? <div className={cn(title || description || meta ? "mt-3" : null)}>{children}</div> : null}
      {footer ? <div className="mt-3 border-t border-white/65 pt-3">{footer}</div> : null}
    </div>
  );
}

export function AdminMetricTile({
  label,
  value,
  unit,
  summary,
  badges,
  meta,
  tone = "slate",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  summary?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <Card
      surface="glass"
      glow={tone === "indigo" ? "brand" : "soft"}
      interactive={false}
      className={cn("rounded-[1.5rem] border-white/75", className)}
    >
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", accentToneClassMap[tone])} />
            <p className="text-sm font-semibold text-slate-900">{label}</p>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
            {unit ? <p className="pb-1 text-sm font-medium text-slate-500">{unit}</p> : null}
          </div>
        </div>
        {summary ? <p className="text-sm leading-6 text-slate-600">{summary}</p> : null}
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        {meta ? <div className="space-y-1 text-xs leading-5 text-slate-500">{meta}</div> : null}
      </CardContent>
    </Card>
  );
}

export function AdminActionDock({
  title,
  description,
  actions,
  tone = "slate",
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: AdminTone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <GlassSurface
      surface="glass"
      className={cn(
        "rounded-[1.5rem] border p-4 shadow-[var(--shadow-card)]",
        bandToneClassMap[tone],
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {title ? <p className="text-sm font-semibold text-slate-950">{title}</p> : null}
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </GlassSurface>
  );
}

export function AdminEmptyState({
  children,
  className,
  tone = "slate",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: AdminTone;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border border-dashed p-5 text-sm leading-6 text-slate-600",
        subsectionToneClassMap[tone],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
