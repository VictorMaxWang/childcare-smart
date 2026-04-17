"use client";

import type { ReactNode } from "react";
import { CalendarClock, Home, School, ShieldAlert, UserRound } from "lucide-react";
import {
  AdminActionDock,
  AdminBand,
  AdminDataItem,
  AdminSubsection,
} from "@/components/admin/AdminVisuals";
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
  toneClassName = "bg-slate-50/80",
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
        <details className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 p-4">
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
  tone,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  tone: "emerald" | "indigo" | "sky";
}) {
  return (
    <AdminSubsection
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
      }
      tone={tone}
      className="p-4"
    >
      <ExpandableList
        items={items}
        visibleCount={PRIMARY_ACTION_LIMIT}
        emptyText="当前暂无明确动作建议。"
        summaryLabel="查看其余"
        toneClassName="bg-white/75"
      />
    </AdminSubsection>
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
      surface="luminous"
      glow="soft"
      className={cn(
        "h-full rounded-[2rem] border-amber-100/90 bg-linear-to-br from-amber-50/95 via-white to-rose-50/70",
        className
      )}
    >
      <CardHeader className="gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getRiskBadgeVariant(decision.riskLevel)}>{decision.priorityLabel}</Badge>
          <Badge variant={getStatusBadgeVariant(decision.status)}>{decision.statusLabel}</Badge>
          <Badge variant="secondary">{decision.riskLabel}</Badge>
          <Badge variant="outline">{decision.className}</Badge>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <CardTitle className="whitespace-normal break-words text-xl text-slate-950">
              {decision.childName}
            </CardTitle>
            <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
              {decision.summary}
            </p>
          </div>

          <AdminBand
            tone="amber"
            title="优先处理原因"
            description={decision.whyHighPriority}
            className="p-4"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <AdminDataItem
            title={
              <span className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-indigo-500" />
                建议负责人
              </span>
            }
            description={decision.recommendedOwnerName}
            tone="slate"
          />
          <AdminDataItem
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-sky-500" />
                建议截止时间
              </span>
            }
            description={decision.recommendedAtLabel}
            tone="sky"
          />
          <AdminDataItem
            title={
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                当前状态
              </span>
            }
            description={decision.statusLabel}
            tone="amber"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <AdminSubsection title="触发原因" tone="amber">
            <ExpandableList
              items={decision.triggerReasons}
              visibleCount={PRIMARY_TRIGGER_LIMIT}
              emptyText="当前没有额外触发原因。"
              summaryLabel="查看其余"
              toneClassName="bg-white/75"
            />
          </AdminSubsection>

          <AdminSubsection title="关键发现" tone="slate">
            <ExpandableList
              items={decision.keyFindings}
              visibleCount={PRIMARY_FINDING_LIMIT}
              emptyText="当前没有额外关键发现。"
              summaryLabel="查看其余"
              toneClassName="bg-white/75"
            />
          </AdminSubsection>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <ActionColumn
            icon={<School className="h-4 w-4 text-emerald-500" />}
            title="今日园内动作"
            items={decision.schoolActions}
            tone="emerald"
          />
          <ActionColumn
            icon={<Home className="h-4 w-4 text-indigo-500" />}
            title="今夜家庭任务"
            items={decision.homeActions}
            tone="indigo"
          />
          <ActionColumn
            icon={<CalendarClock className="h-4 w-4 text-sky-500" />}
            title="48 小时复查"
            items={decision.followUpActions}
            tone="sky"
          />
        </div>

        <p className="whitespace-normal break-words text-xs text-slate-500">
          生成时间：{decision.generatedAtLabel}
          {decision.statusSource === "dispatch" ? " | 状态已与派单同步" : ""}
          {hasChildLevelFallbackNotification ? " | 当前按儿童维度关联" : ""}
        </p>

        <AdminActionDock
          tone="slate"
          title="会诊派单入口"
          description="当前会诊可以沉淀成一条独立派单，便于后续持续跟进。"
          actions={
            dispatchAvailable ? (
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
            ) : null
          }
        >
          {!dispatchAvailable ? (
            <p className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-600">
              {dispatchStatusMessage ?? "当前先保留这张优先事项卡，派单入口可稍后补建。"}
            </p>
          ) : null}
        </AdminActionDock>
      </CardContent>
    </Card>
  );
}
