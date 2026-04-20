"use client";

import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import {
  AdminBand,
  AdminEmptyState,
} from "@/components/admin/AdminVisuals";
import ConsultationTraceCard from "@/components/admin/ConsultationTraceCard";
import DirectorDecisionCard from "@/components/admin/DirectorDecisionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import { cn } from "@/lib/utils";

type RiskPriorityBoardProps = {
  items: AdminConsultationPriorityItem[];
  className?: string;
  layoutVariant?: "split" | "stacked";
  emptyHref?: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  sourceBadgeLabel?: string;
  sourceBadgeVariant?: "success" | "warning" | "outline";
  onCreateConsultationNotification?: (item: AdminConsultationPriorityItem) => unknown;
  isCreatingConsultationNotification?: (consultationId: string) => boolean;
  notificationError?: string | null;
  dispatchAvailable?: boolean;
  dispatchStatusMessage?: string;
};

export default function RiskPriorityBoard({
  items,
  className,
  layoutVariant = "split",
  emptyHref = "/teacher/high-risk-consultation",
  isLoading = false,
  emptyTitle,
  emptyDescription,
  sourceBadgeLabel,
  sourceBadgeVariant = "outline",
  onCreateConsultationNotification,
  isCreatingConsultationNotification,
  notificationError,
  dispatchAvailable = true,
  dispatchStatusMessage,
}: RiskPriorityBoardProps) {
  const effectiveDispatchAvailable = notificationError ? false : dispatchAvailable;
  const effectiveDispatchStatusMessage =
    dispatchStatusMessage ??
    (notificationError ? "派单暂不可用" : effectiveDispatchAvailable ? "可继续派单" : "派单暂不可用");

  if (items.length === 0) {
    return (
      <AdminEmptyState
        tone={effectiveDispatchAvailable ? "slate" : "amber"}
        className={cn("rounded-[1.9rem] p-0", className)}
      >
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
            <div className="space-y-2">
              <p className="font-semibold text-white/92">
                {isLoading ? "正在读取重点会诊" : emptyTitle ?? "当前还没有需要优先处理的会诊"}
              </p>
              <p className="leading-6 text-white/64">
                {isLoading
                  ? "系统正在同步重点会诊；如果机构数据暂不可用，这里会先展示本地已有结论。"
                  : emptyDescription ?? "当教师端产生新的重点会诊后，这里会自动更新。"}
              </p>
              {!effectiveDispatchAvailable ? (
                <p className="text-sm leading-6 text-white/48">
                  {effectiveDispatchStatusMessage}，当前先展示只读建议。
                </p>
              ) : null}
            </div>
          </div>

          {effectiveDispatchAvailable ? (
            <Button asChild variant="outline" className="min-h-11 rounded-xl md:self-start">
              <Link href={emptyHref} className="gap-2">
                前往会诊入口
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </AdminEmptyState>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <AdminBand
        tone="indigo"
        eyebrow={
          <>
            <Badge variant="warning">重点会诊决策区</Badge>
            {sourceBadgeLabel ? <Badge variant={sourceBadgeVariant}>{sourceBadgeLabel}</Badge> : null}
            <Badge variant="outline">共 {items.length} 条会诊</Badge>
            <Badge variant="info">按风险、状态与时间排序</Badge>
          </>
        }
        title="今日需要园长优先判断的升级会诊"
        description="统一板头、来源 badge、派单状态、空态与配对式双面板材质。"
        actions={
          <Badge variant={effectiveDispatchAvailable ? "success" : "outline"}>
            {effectiveDispatchStatusMessage}
          </Badge>
        }
      />

      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={item.consultationId}
            className={cn(
              "min-w-0 gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-3 shadow-[var(--shadow-card)]",
              layoutVariant === "stacked"
                ? "flex flex-col"
                : "grid xl:grid-cols-[minmax(0,1.04fr)_minmax(380px,0.96fr)] xl:items-start"
            )}
          >
            <DirectorDecisionCard
              item={item}
              onCreateConsultationNotification={onCreateConsultationNotification}
              isCreatingNotification={isCreatingConsultationNotification?.(item.consultationId) ?? false}
              dispatchAvailable={effectiveDispatchAvailable}
              dispatchStatusMessage={effectiveDispatchStatusMessage}
            />
            <ConsultationTraceCard item={item} className="min-w-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
