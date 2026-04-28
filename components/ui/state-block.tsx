import * as React from "react";
import { AlertTriangle, Loader2, LockKeyhole, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StateBlockTone = "neutral" | "info" | "success" | "warning" | "danger" | "permission";

export interface StateBlockProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: StateBlockTone;
}

const toneClassMap: Record<StateBlockTone, string> = {
  neutral: "bg-white text-indigo-600 ring-indigo-100",
  info: "bg-white text-sky-600 ring-sky-100",
  success: "bg-white text-emerald-600 ring-emerald-100",
  warning: "bg-white text-amber-600 ring-amber-100",
  danger: "bg-white text-rose-600 ring-rose-100",
  permission: "bg-white text-indigo-600 ring-indigo-100",
};

const stateBackdropMap: Record<StateBlockTone, string> = {
  neutral: "from-slate-50 via-white to-indigo-50/70",
  info: "from-sky-50 via-white to-indigo-50/70",
  success: "from-emerald-50 via-white to-sky-50/70",
  warning: "from-amber-50 via-white to-orange-50/70",
  danger: "from-rose-50 via-white to-amber-50/70",
  permission: "from-indigo-50 via-white to-violet-50/80",
};

function StateBlock({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
  ...props
}: StateBlockProps) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-[18rem] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.6rem] border border-indigo-100 bg-gradient-to-br px-5 py-8 text-center shadow-[0_24px_76px_rgb(79_70_229_/_0.10)] sm:px-8 sm:py-10",
        stateBackdropMap[tone],
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute -left-10 top-8 h-32 w-32 rounded-full bg-white/70 blur-2xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-12 bottom-4 h-36 w-36 rounded-full bg-indigo-100/55 blur-2xl" aria-hidden="true" />
      <div className="relative mb-1 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/65 shadow-[0_20px_48px_rgb(79_70_229_/_0.12)] ring-1 ring-white/80">
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-8", toneClassMap[tone])}>
          {icon ?? <Search className="h-7 w-7" />}
        </div>
      </div>
      <h3 className="mt-4 max-w-xl break-words text-xl font-semibold leading-tight text-slate-950 sm:text-2xl">{title}</h3>
      {description ? <p className="mt-3 max-w-xl break-words text-sm leading-7 text-slate-600">{description}</p> : null}
      {action ? (
        <div className="mt-6 flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row [&_button]:min-h-12 [&_button]:rounded-2xl">
          {action}
        </div>
      ) : null}
    </div>
  );
}

interface EmptyStateProps extends Omit<StateBlockProps, "tone"> {
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ actionLabel, onAction, action, icon, ...props }: EmptyStateProps) {
  return (
    <StateBlock
      tone="neutral"
      icon={icon ?? <Search className="h-7 w-7" />}
      action={action ?? (actionLabel && onAction ? <Button variant="outline" onClick={onAction}>{actionLabel}</Button> : undefined)}
      {...props}
    />
  );
}

function ErrorState(props: Omit<StateBlockProps, "tone" | "icon">) {
  return <StateBlock role="alert" tone="danger" icon={<AlertTriangle className="h-7 w-7" />} {...props} />;
}

function PermissionState(props: Omit<StateBlockProps, "tone" | "icon">) {
  return <StateBlock role="alert" tone="permission" icon={<LockKeyhole className="h-7 w-7" />} {...props} />;
}

function LoadingState({
  title = "正在加载",
  description = "请稍候，系统正在整理当前页面内容和记录状态。",
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateBlock
      title={title}
      description={description}
      tone="info"
      icon={<Loader2 className="h-7 w-7 animate-spin" />}
      className={className}
    />
  );
}

function SkeletonBlock({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-h-24 overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-[linear-gradient(110deg,#eef2ff_8%,#f8fafc_18%,#ecfeff_33%)] bg-[length:200%_100%] shadow-[0_12px_36px_rgb(79_70_229_/_0.06)] skeleton-pulse",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export { EmptyState, ErrorState, LoadingState, PermissionState, SkeletonBlock, StateBlock };
