"use client";

import type { ReactNode } from "react";
import { CalendarClock, Home, School, ShieldAlert, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  hasConsultationScopedNotification,
  type AdminConsultationPriorityItem,
} from "@/lib/agent/admin-consultation";
import { cn } from "@/lib/utils";

const PRIMARY_TRIGGER_LIMIT = 2;
const PRIMARY_FINDING_LIMIT = 2;
const PRIMARY_ACTION_LIMIT = 2;

function getRiskBadgeVariant(item: AdminConsultationPriorityItem["decision"]["riskLevel"]) {
  if (item === "high") return "warning" as const;
  if (item === "medium") return "info" as const;
  return "secondary" as const;
}

function getStatusBadgeVariant(item: AdminConsultationPriorityItem["decision"]["status"]) {
  if (item === "completed") return "success" as const;
  if (item === "in_progress") return "info" as const;
  return "outline" as const;
}

function TextList({
  items,
  emptyText,
  toneClassName = "bg-slate-50",
}: {
  items: string[];
  emptyText: string;
  toneClassName?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <p key={item} className={cn("rounded-xl px-3 py-2 whitespace-normal break-words", toneClassName)}>
          {item}
        </p>
      ))}
    </div>
  );
}

function ExpandableList({
  items,
  visibleCount,
  emptyText,
  summaryLabel,
  toneClassName,
}: {
  items: string[];
  visibleCount: number;
  emptyText: string;
  summaryLabel: string;
  toneClassName?: string;
}) {
  const visibleItems = items.slice(0, visibleCount);
  const extraItems = items.slice(visibleCount);

  return (
    <div className="space-y-3">
      <TextList items={visibleItems} emptyText={emptyText} toneClassName={toneClassName} />
      {extraItems.length > 0 ? (
        <details className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
            {summaryLabel} {extraItems.length} 条
          </summary>
          <div className="mt-3">
            <TextList items={extraItems} emptyText={emptyText} toneClassName={toneClassName} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ActionColumn({
  icon,
  title,
  items,
  toneClassName,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  toneClassName: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border p-4", toneClassName)}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <div className="mt-3">
        <ExpandableList
          items={items}
          visibleCount={PRIMARY_ACTION_LIMIT}
          emptyText="当前暂无明确动作建议。"
          summaryLabel="查看其余"
          toneClassName="bg-white/70"
        />
      </div>
    </div>
  );
}

type DirectorDecisionCardProps = {
  item: AdminConsultationPriorityItem;
  className?: string;
  onCreateConsultationNotification?: (item: AdminConsultationPriorityItem) => unknown;
  isCreatingNotification?: boolean;
  dispatchAvailable?: boolean;
  dispatchStatusMessage?: string;
};

export default function DirectorDecisionCard({
  item,
  className,
  onCreateConsultationNotification,
  isCreatingNotification = false,
  dispatchAvailable = true,
  dispatchStatusMessage,
}: DirectorDecisionCardProps) {
  const { decision } = item;
  const hasConsultationNotification = hasConsultationScopedNotification(item);
  const hasChildLevelFallbackNotification =
    item.dispatchBindingScope === "child" && Boolean(item.dispatchEvent);
  const canCreateConsultationNotification =
    dispatchAvailable &&
    Boolean(onCreateConsultationNotification) &&
    Boolean(item.notificationPayload) &&
    !isCreatingNotification &&
    !hasConsultationNotification;

  return (
    <Card
      className={cn(
        "h-full rounded-[28px] border-amber-100 bg-linear-to-br from-amber-50 via-white to-rose-50 shadow-sm",
        className
      )}
    >
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getRiskBadgeVariant(decision.riskLevel)}>{decision.priorityLabel}</Badge>
          <Badge variant={getStatusBadgeVariant(decision.status)}>{decision.statusLabel}</Badge>
          <Badge variant="secondary">{decision.riskLabel}</Badge>
          <Badge variant="outline">{decision.className}</Badge>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            <CardTitle className="whitespace-normal break-words text-xl text-slate-900">
              {decision.childName}
            </CardTitle>
            <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
              {decision.summary}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-white/85 p-4">
            <p className="text-xs font-semibold tracking-[0.24em] text-amber-700">优先处理原因</p>
            <p className="mt-3 whitespace-normal break-words text-sm leading-7 text-slate-700">
              {decision.whyHighPriority}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-semibold text-slate-900">建议负责人</p>
            </div>
            <p className="mt-3 whitespace-normal break-words text-sm text-slate-600">
              {decision.recommendedOwnerName}
            </p>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-sky-500" />
              <p className="text-sm font-semibold text-slate-900">建议截止时间</p>
            </div>
            <p className="mt-3 whitespace-normal break-words text-sm text-slate-600">
              {decision.recommendedAtLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold text-slate-900">当前状态</p>
            </div>
            <p className="mt-3 whitespace-normal break-words text-sm text-slate-600">
              {decision.statusLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
            <p className="text-sm font-semibold text-slate-900">触发原因</p>
            <div className="mt-3">
              <ExpandableList
                items={decision.triggerReasons}
                visibleCount={PRIMARY_TRIGGER_LIMIT}
                emptyText="当前没有额外触发原因。"
                summaryLabel="查看其余"
                toneClassName="bg-amber-50"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
            <p className="text-sm font-semibold text-slate-900">关键发现</p>
            <div className="mt-3">
              <ExpandableList
                items={decision.keyFindings}
                visibleCount={PRIMARY_FINDING_LIMIT}
                emptyText="当前没有额外关键发现。"
                summaryLabel="查看其余"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <ActionColumn
            icon={<School className="h-4 w-4 text-emerald-500" />}
            title="今日园内动作"
            items={decision.schoolActions}
            toneClassName="border-emerald-100 bg-emerald-50/80"
          />
          <ActionColumn
            icon={<Home className="h-4 w-4 text-indigo-500" />}
            title="今晚家庭任务"
            items={decision.homeActions}
            toneClassName="border-indigo-100 bg-indigo-50/70"
          />
          <ActionColumn
            icon={<CalendarClock className="h-4 w-4 text-sky-500" />}
            title="48 小时复查"
            items={decision.followUpActions}
            toneClassName="border-sky-100 bg-sky-50/80"
          />
        </div>

        <p className="whitespace-normal break-words text-xs text-slate-500">
          生成时间：{decision.generatedAtLabel}
          {decision.statusSource === "dispatch" ? " | 状态已与派单同步" : ""}
          {hasChildLevelFallbackNotification ? " | 当前按儿童维度关联" : ""}
        </p>

        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-slate-900">会诊派单入口</p>
              <p className="whitespace-normal break-words text-sm leading-6 text-slate-600">
                当前会诊可以沉淀为一条独立派单，便于后续持续跟进。
              </p>
            </div>

            {dispatchAvailable ? (
              <Button
                type="button"
                size="sm"
                variant="premium"
                onClick={() => void onCreateConsultationNotification?.(item)}
                disabled={!canCreateConsultationNotification}
              >
                {isCreatingNotification
                  ? "创建中..."
                  : hasConsultationNotification
                    ? "已创建会诊派单"
                    : "创建会诊派单"}
              </Button>
            ) : null}
          </div>

          {!dispatchAvailable ? (
            <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {dispatchStatusMessage ?? "当前先保留这张优先事项卡，派单入口可稍后补建。"}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
