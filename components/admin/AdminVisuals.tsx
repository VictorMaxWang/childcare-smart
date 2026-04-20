import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import GlassSurface from "@/components/visuals/GlassSurface";
import { cn } from "@/lib/utils";

export type AdminTone = "slate" | "indigo" | "sky" | "amber" | "emerald" | "rose";

type AdminToneStyle = CSSProperties & {
  "--admin-accent-rgb": string;
  "--admin-secondary-rgb": string;
  "--admin-border": string;
  "--admin-border-strong": string;
};

const toneStyleMap: Record<AdminTone, AdminToneStyle> = {
  slate: {
    "--admin-accent-rgb": "132,122,255",
    "--admin-secondary-rgb": "96,108,255",
    "--admin-border": "rgba(162, 170, 255, 0.16)",
    "--admin-border-strong": "rgba(182, 190, 255, 0.24)",
  },
  indigo: {
    "--admin-accent-rgb": "148,126,255",
    "--admin-secondary-rgb": "108,112,255",
    "--admin-border": "rgba(176, 156, 255, 0.18)",
    "--admin-border-strong": "rgba(194, 182, 255, 0.28)",
  },
  sky: {
    "--admin-accent-rgb": "114,128,255",
    "--admin-secondary-rgb": "162,138,255",
    "--admin-border": "rgba(158, 170, 255, 0.18)",
    "--admin-border-strong": "rgba(184, 196, 255, 0.26)",
  },
  amber: {
    "--admin-accent-rgb": "170,132,255",
    "--admin-secondary-rgb": "120,108,255",
    "--admin-border": "rgba(188, 162, 255, 0.2)",
    "--admin-border-strong": "rgba(208, 184, 255, 0.28)",
  },
  emerald: {
    "--admin-accent-rgb": "126,140,255",
    "--admin-secondary-rgb": "172,142,255",
    "--admin-border": "rgba(164, 176, 255, 0.18)",
    "--admin-border-strong": "rgba(194, 202, 255, 0.26)",
  },
  rose: {
    "--admin-accent-rgb": "180,132,255",
    "--admin-secondary-rgb": "132,116,255",
    "--admin-border": "rgba(192, 164, 255, 0.18)",
    "--admin-border-strong": "rgba(214, 190, 255, 0.28)",
  },
};

function getToneStyle(tone: AdminTone) {
  return toneStyleMap[tone];
}

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
      className={cn("admin-governance-band", className)}
      style={getToneStyle(tone)}
    >
      <div className="admin-governance-band__header">
        <div className="min-w-0 space-y-3">
          {eyebrow ? <div className="flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
          {title ? (
            <p className="text-lg font-semibold tracking-tight text-white sm:text-[1.18rem]">{title}</p>
          ) : null}
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-white/66">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">{actions}</div> : null}
      </div>
      {children ? <div className="admin-governance-band__content">{children}</div> : null}
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
      className={cn("admin-governance-subsection", className)}
      style={getToneStyle(tone)}
    >
      {title || description || actions ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <p className="text-sm font-semibold text-white/92">{title}</p> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-white/62">{description}</p> : null}
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
      className={cn("admin-governance-item", className)}
      style={getToneStyle(tone)}
    >
      <span aria-hidden="true" className="admin-governance-item__accent" />
      <div className="admin-governance-item__body">
        {title || badge ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title ? <p className="text-sm font-semibold text-white/92">{title}</p> : null}
              {description ? <div className="mt-2 text-sm leading-6 text-white/66">{description}</div> : null}
            </div>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
        ) : null}
        {!title && description ? <div className="text-sm leading-6 text-white/66">{description}</div> : null}
        {meta ? <div className="mt-3 text-xs leading-5 text-white/48">{meta}</div> : null}
        {children ? <div className={cn(title || description || meta ? "mt-3" : null)}>{children}</div> : null}
        {footer ? <div className="mt-3 border-t border-white/8 pt-3">{footer}</div> : null}
      </div>
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
      glow={tone === "indigo" || tone === "amber" ? "brand" : "soft"}
      interactive={false}
      className={cn("admin-governance-metric", className)}
      style={getToneStyle(tone)}
    >
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="admin-governance-metric__dot" />
            <p className="text-sm font-semibold text-white/84">{label}</p>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
            {unit ? <p className="pb-1 text-sm font-medium text-white/52">{unit}</p> : null}
          </div>
        </div>
        {summary ? <div className="text-sm leading-6 text-white/62">{summary}</div> : null}
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        {meta ? <div className="space-y-1 text-xs leading-5 text-white/46">{meta}</div> : null}
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
      className={cn("admin-governance-dock", className)}
      style={getToneStyle(tone)}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {title ? <p className="text-sm font-semibold text-white/92">{title}</p> : null}
          {description ? <p className="mt-1 text-sm leading-6 text-white/62">{description}</p> : null}
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
      className={cn("admin-governance-empty", className)}
      style={getToneStyle(tone)}
      {...props}
    >
      {children}
    </div>
  );
}
