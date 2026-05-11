import type { HTMLAttributes, ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state-block";
import { ReplicaPanel, ReplicaStatusPill } from "@/components/cards";
import { cn } from "@/lib/utils";

export function ReplicaChartFrame({
  actions,
  children,
  className,
  description,
  empty,
  error,
  isEmpty = false,
  legend,
  loading = false,
  minHeight = "18rem",
  title,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  isEmpty?: boolean;
  legend?: ReactNode;
  loading?: boolean;
  minHeight?: string;
  title: ReactNode;
}) {
  return (
    <ReplicaPanel
      {...props}
      title={title}
      description={description}
      className={cn("bg-white/94", className)}
      actions={
        actions ?? (
          <ReplicaStatusPill tone="info">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            图表
          </ReplicaStatusPill>
        )
      }
    >
      <div className="min-w-0" style={{ minHeight }}>
        {loading ? (
          <SkeletonBlock className="h-full min-h-64" />
        ) : error ? (
          <ErrorState className="min-h-64 shadow-none" title="图表加载失败" description={error} />
        ) : isEmpty ? (
          empty ?? <EmptyState className="min-h-64 shadow-none" title="暂无图表数据" description="当前筛选条件下还没有可展示的数据。" />
        ) : (
          children
        )}
      </div>
      {loading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          正在整理图表数据
        </div>
      ) : legend ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">{legend}</div>
      ) : null}
    </ReplicaPanel>
  );
}

export function ReplicaChartLegendItem({
  className,
  color,
  label,
}: {
  className?: string;
  color: string;
  label: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
