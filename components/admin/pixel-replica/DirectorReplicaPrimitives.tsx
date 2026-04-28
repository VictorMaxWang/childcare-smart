import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "purple" | "green" | "orange" | "red" | "slate";
type ButtonTone = "primary" | "soft" | "outline" | "ghost";

const metricToneClass: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  purple: "bg-violet-50 text-violet-600 ring-violet-100",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  orange: "bg-orange-50 text-orange-600 ring-orange-100",
  red: "bg-red-50 text-red-600 ring-red-100",
  slate: "bg-slate-50 text-slate-600 ring-slate-100",
};

const buttonToneClass: Record<ButtonTone, string> = {
  primary:
    "bg-gradient-to-r from-[#635BFF] to-[#7048F8] text-white shadow-[0_12px_22px_rgba(99,91,255,0.28)] hover:from-[#5147f5] hover:to-[#623be8]",
  soft: "border border-[#E4E7F5] bg-[#F7F8FF] text-[#5B58DE] hover:bg-[#EEF0FF]",
  outline: "border border-[#E4E7F5] bg-white text-[#172554] shadow-sm hover:border-[#C8CEF4] hover:bg-[#F8FAFF]",
  ghost: "text-[#5B58DE] hover:bg-[#F2F4FF]",
};

export function DirectorReplicaPage({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "min-h-[calc(100vh-80px)] bg-[#F8FAFF] px-4 py-5 text-[#172554] sm:px-6 lg:px-8",
        className
      )}
    >
      <div className="mx-auto flex max-w-[1220px] flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-[18px] border border-white bg-white/80 px-2 py-1 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#5B58DE]">
              {eyebrow}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-normal text-[#111B3F] sm:text-[32px] sm:leading-[1.12]">
              {title}
            </h1>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7380A0]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </header>
        {children}
      </div>
    </main>
  );
}

export function ReplicaPanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] border border-[#E7EBF7] bg-white shadow-[0_18px_45px_rgba(30,41,93,0.06)]",
        className
      )}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 border-b border-[#EEF1F8] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-bold text-[#172554]">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-[#7A86A6]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function ReplicaButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonTone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
        buttonToneClass[variant],
        className
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function ReplicaButton({
  children,
  variant = "outline",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonTone;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-55",
        buttonToneClass[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ReplicaPill({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        metricToneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function ReplicaMetric({
  label,
  value,
  subValue,
  delta,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  subValue?: string;
  delta?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-h-[122px] rounded-[16px] border border-[#E8ECF7] bg-white px-5 py-4 shadow-[0_12px_28px_rgba(31,41,88,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#596681]">{label}</p>
        {icon ? (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full ring-1", metricToneClass[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-[30px] font-bold leading-none text-[#111B3F]">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#7A86A6]">
        {subValue ? <span>{subValue}</span> : null}
        {delta ? <span className="font-semibold text-[#23B26D]">{delta}</span> : null}
      </div>
    </div>
  );
}

export function MiniLineChart({
  data,
  color = "#635BFF",
  height = 156,
  labels,
}: {
  data: number[];
  color?: string;
  height?: number;
  labels?: string[];
}) {
  const width = 520;
  const paddingX = 18;
  const paddingY = 22;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const points = data.map((value, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(data.length - 1, 1);
    const y = paddingY + ((max - value) * (height - paddingY * 2)) / range;
    return { x, y, value };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${path} L ${points.at(-1)?.x ?? paddingX} ${height - paddingY} L ${paddingX} ${
    height - paddingY
  } Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="趋势图">
        <defs>
          <linearGradient id={`area-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = paddingY + (line * (height - paddingY * 2)) / 3;
          return <line key={line} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#EAF0FB" />;
        })}
        <path d={areaPath} fill={`url(#area-${color.replace("#", "")})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={`${point.x}-${point.value}`} cx={point.x} cy={point.y} r="4" fill="white" stroke={color} strokeWidth="2" />
        ))}
      </svg>
      {labels ? (
        <div className="mt-1 grid grid-cols-7 text-center text-xs text-[#8B96B1]">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DonutChart({
  totalLabel,
  totalValue,
  segments,
}: {
  totalLabel: string;
  totalValue: string;
  segments: Array<{ label: string; value: number; detail: string; color: string }>;
}) {
  const segmentOffsets = segments.map((segment, index) => ({
    ...segment,
    offset: 25 + segments.slice(0, index).reduce((sum, item) => sum + item.value, 0),
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
      <div className="relative h-[150px] w-[150px]">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#EDF1FA" strokeWidth="7" />
          {segmentOffsets.map((segment) => {
            return (
              <circle
                key={segment.label}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={segment.color}
                strokeWidth="7"
                strokeDasharray={`${segment.value} ${100 - segment.value}`}
                strokeDashoffset={-segment.offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-semibold text-[#7A86A6]">{totalLabel}</span>
          <span className="mt-1 text-[24px] font-bold text-[#172554]">{totalValue}</span>
        </div>
      </div>
      <div className="space-y-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-[#596681]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="font-semibold text-[#172554]">{segment.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
