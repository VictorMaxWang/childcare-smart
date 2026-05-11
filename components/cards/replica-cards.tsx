import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReplicaTone = "primary" | "info" | "success" | "warning" | "danger" | "neutral" | "pending";
export type ReplicaTrend = "up" | "down" | "flat";

const toneClassMap: Record<ReplicaTone, string> = {
  primary: "border-indigo-100 bg-indigo-50 text-indigo-700",
  info: "border-sky-100 bg-sky-50 text-sky-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
  danger: "border-rose-100 bg-rose-50 text-rose-700",
  neutral: "border-slate-100 bg-slate-50 text-slate-600",
  pending: "border-violet-100 bg-violet-50 text-violet-700",
};

const trendIconMap = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

export interface ReplicaPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  "data-testid"?: string;
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  title?: ReactNode;
}

export function ReplicaPanel({
  actions,
  bodyClassName,
  children,
  className,
  description,
  footer,
  padded = true,
  title,
  "data-testid": dataTestId,
  ...props
}: ReplicaPanelProps) {
  const hasHeader = title || description || actions;
  const testId = dataTestId ?? "r02-replica-panel";

  return (
    <section
      {...props}
      data-testid={testId}
      className={cn("replica-panel overflow-hidden text-[var(--replica-text)]", className)}
    >
      {hasHeader ? (
        <div className="flex flex-col gap-3 border-b border-indigo-50 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-bold leading-tight text-slate-950">{title}</h2> : null}
            {description ? <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(padded ? "p-5 sm:p-6" : "p-0", bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-indigo-50 bg-slate-50/80 px-5 py-4 sm:px-6">{footer}</div> : null}
    </section>
  );
}

export function ReplicaStatusPill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: ReplicaTone;
}) {
  return (
    <span
      data-testid="r02-status-pill"
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold", toneClassMap[tone], className)}
    >
      {children}
    </span>
  );
}

export function ReplicaAvatar({
  alt,
  children,
  className,
  tone = "primary",
}: {
  alt?: string;
  children: ReactNode;
  className?: string;
  tone?: ReplicaTone;
}) {
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt}
      className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg shadow-sm", toneClassMap[tone], className)}
    >
      {children}
    </span>
  );
}

export function ReplicaMetricCard({
  className,
  description,
  icon,
  label,
  tone = "primary",
  trend,
  trendLabel,
  value,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  tone?: ReplicaTone;
  trend?: ReplicaTrend;
  trendLabel?: ReactNode;
  value: ReactNode;
}) {
  const TrendIcon = trend ? trendIconMap[trend] : null;

  return (
    <div
      {...props}
      data-testid="r02-metric-card"
      className={cn("replica-card min-h-32 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--replica-shadow-card-hover)] sm:p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--replica-text-muted)]">{label}</p>
          <div className="mt-2 text-2xl font-bold leading-tight text-[var(--replica-text)]">{value}</div>
        </div>
        {icon ? <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", toneClassMap[tone])}>{icon}</div> : null}
      </div>
      {description || trendLabel ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--replica-text-soft)]">
          {trendLabel && TrendIcon ? (
            <ReplicaStatusPill tone={tone} className="px-2 py-0.5">
              <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {trendLabel}
            </ReplicaStatusPill>
          ) : null}
          {description ? <span>{description}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ReplicaActionCard({
  className,
  description,
  href,
  icon,
  label,
  title,
  tone = "primary",
}: {
  className?: string;
  description: ReactNode;
  href: string;
  icon?: ReactNode;
  label: ReactNode;
  title: ReactNode;
  tone?: ReplicaTone;
}) {
  return (
    <Link
      data-testid="r02-action-card"
      href={href}
      className={cn("replica-card group flex min-h-28 items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--replica-shadow-card-hover)]", className)}
    >
      {icon ? <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border", toneClassMap[tone])}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-slate-950">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-indigo-600">
        {label}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
