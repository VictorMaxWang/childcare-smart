import * as React from "react";
import { AlertTriangle, Loader2, Search, ShieldAlert } from "lucide-react";
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
  neutral: "bg-(--neutral-soft) text-(--neutral-foreground)",
  info: "bg-(--info-soft) text-(--info-foreground)",
  success: "bg-(--success-soft) text-(--success-foreground)",
  warning: "bg-(--warning-soft) text-(--warning-foreground)",
  danger: "bg-(--danger-soft) text-(--danger-foreground)",
  permission: "bg-(--primary-soft) text-(--primary)",
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
        "flex min-h-[14rem] min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-(--border) bg-white px-4 py-8 text-center shadow-[var(--shadow-card)] sm:px-6 sm:py-10",
        className
      )}
      {...props}
    >
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneClassMap[tone])}>
        {icon ?? <Search className="h-6 w-6" />}
      </div>
      <h3 className="mt-4 max-w-full break-words text-base font-semibold leading-6 text-(--text-primary)">{title}</h3>
      {description ? <p className="mt-2 max-w-md break-words text-sm leading-6 text-(--text-tertiary)">{description}</p> : null}
      {action ? <div className="mt-5 flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">{action}</div> : null}
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
      icon={icon ?? <Search className="h-6 w-6" />}
      action={action ?? (actionLabel && onAction ? <Button variant="outline" onClick={onAction}>{actionLabel}</Button> : undefined)}
      {...props}
    />
  );
}

function ErrorState(props: Omit<StateBlockProps, "tone" | "icon">) {
  return <StateBlock role="alert" tone="danger" icon={<AlertTriangle className="h-6 w-6" />} {...props} />;
}

function PermissionState(props: Omit<StateBlockProps, "tone" | "icon">) {
  return <StateBlock role="alert" tone="permission" icon={<ShieldAlert className="h-6 w-6" />} {...props} />;
}

function LoadingState({
  title = "正在加载",
  description = "请稍候，系统正在准备页面内容。",
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
      icon={<Loader2 className="h-6 w-6 animate-spin" />}
      className={className}
    />
  );
}

function SkeletonBlock({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-24 rounded-lg border border-(--border-subtle) bg-linear-to-r from-slate-100 via-slate-50 to-slate-100 skeleton-pulse", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { EmptyState, ErrorState, LoadingState, PermissionState, SkeletonBlock, StateBlock };
