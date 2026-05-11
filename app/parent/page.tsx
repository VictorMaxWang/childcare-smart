"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenText,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  HeartPulse,
  MessageCircleMore,
  MoonStar,
  Sparkles,
  TrendingUp,
  Utensils,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import CareModeToggle from "@/components/parent/CareModeToggle";
import ParentCareFocusCard from "@/components/parent/ParentCareFocusCard";
import {
  ParentActionCard,
  ParentGentleNotice,
  ParentTimelineCard,
  ParentWeeklySignalGrid,
  type ParentTimelineItem,
  type ParentWeeklySignal,
} from "@/components/parent/ParentReviewKit";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import ParentTransparencyPanel from "@/components/parent/ParentTransparencyPanel";
import PixelParentHomeReplica, {
  type ParentPixelGrowthImage,
  type ParentPixelReminderItem,
  type ParentPixelStatusItem,
  type ParentPixelTrendPoint,
} from "@/components/parent/PixelParentHomeReplica";
import { useParentD01Data } from "@/components/parent/useParentD01Data";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
import {
  ReplicaComboChart,
  replicaChartColors,
  type ReplicaChartDatum,
} from "@/components/charts";
import {
  InlineLinkButton,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildParentAgentChildContext,
  buildParentAgentSuggestionResult,
  buildParentChildSuggestionSnapshot,
  type ParentAgentResult,
} from "@/lib/agent/parent-agent";
import { sanitizeParentFacingText } from "@/lib/agent/parent-copy";
import { buildParentHomeTransparencyModel } from "@/lib/agent/parent-transparency";
import { buildParentWeeklyReportSnapshot } from "@/lib/agent/parent-weekly-report";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import type { AiSuggestionResponse, WeeklyReportResponse } from "@/lib/ai/types";
import { useCareMode } from "@/lib/care-mode";
import { buildParentSpeechScript } from "@/lib/voice/browser-tts";
import { buildParentHomeViewModel } from "@/lib/view-models/role-home";
import { formatDisplayDate, getAgeText } from "@/lib/store";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});
const DAY_MS = 24 * 60 * 60 * 1000;
const PARENT_MEAL_PRIORITY: Record<string, number> = {
  早餐: 1,
  晚餐: 2,
  加餐: 3,
  午餐: 4,
};

function parentDateKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 10) : "";
}

function parentAddDays(key: string, days: number) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function average(values: Array<number | null | undefined>) {
  const finiteValues = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return finiteValues.length > 0
    ? Math.round(finiteValues.reduce((sum, item) => sum + item, 0) / finiteValues.length)
    : null;
}

function formatTimelineTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ParentHomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child");
  const {
    currentUser,
    getParentFeed,
    attendanceRecords,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    healthMaterials,
    taskCheckInRecords,
    messages,
    reminders,
    nutritionMenus,
    storybooks,
    getChildInterventionCard,
    getLatestConsultationForChild,
    parentHomeData,
    invalidChildId,
  } = useParentD01Data(childFromQuery);
  const { careMode, setCareMode } = useCareMode();
  const [showMoreContent, setShowMoreContent] = useState(false);
  const parentFeed = getParentFeed();
  const authorizedChildIds = useMemo(
    () => new Set(parentFeed.map((item) => item.child.id)),
    [parentFeed]
  );
  const resolvedChildId =
    childFromQuery && authorizedChildIds.has(childFromQuery)
      ? childFromQuery
      : invalidChildId
        ? ""
        : parentFeed[0]?.child.id ?? "";
  const feed = parentFeed.find((item) => item.child.id === resolvedChildId);
  const viewModel = buildParentHomeViewModel(feed);
  const [previewResult, setPreviewResult] = useState<ParentAgentResult | null>(null);
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);
  const latestInterventionCard = feed ? getChildInterventionCard(feed.child.id) : undefined;
  const latestConsultation = feed ? getLatestConsultationForChild(feed.child.id) : undefined;
  const latestHealthMaterial = useMemo(() => {
    if (!feed) return undefined;
    return healthMaterials
      .filter((material) => material.childId === feed.child.id)
      .filter((material) => material.parseStatus === "completed")
      .sort((left, right) =>
        (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
      )[0];
  }, [feed, healthMaterials]);
  const latestHealthMaterialParse =
    latestHealthMaterial?.parseResult && typeof latestHealthMaterial.parseResult === "object"
      ? latestHealthMaterial.parseResult
      : undefined;
  const latestHealthMaterialSummary =
    typeof latestHealthMaterialParse?.summary === "string"
      ? sanitizeParentFacingText(latestHealthMaterialParse.summary)
      : "";
  const latestHealthMaterialFollowUp =
    Array.isArray(latestHealthMaterialParse?.followUpHints) && latestHealthMaterialParse.followUpHints.length > 0
      ? sanitizeParentFacingText(
          (latestHealthMaterialParse.followUpHints[0] as { detail?: string; title?: string }).detail ??
            (latestHealthMaterialParse.followUpHints[0] as { title?: string }).title
        )
      : "";

  useEffect(() => {
    if (!feed || invalidChildId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("child", feed.child.id);
    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) {
      return;
    }

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [feed, invalidChildId, pathname, router, searchParams]);

  const previewContext = useMemo(() => {
    if (!feed) return null;

    return buildParentAgentChildContext({
      child: feed.child,
      smartInsights: feed.suggestions,
      healthCheckRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks,
      taskCheckInRecords,
      weeklyTrend: feed.weeklyTrend,
    });
  }, [
    feed,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    mealRecords,
    taskCheckInRecords,
  ]);

  const snapshot = useMemo(
    () => (previewContext ? buildParentChildSuggestionSnapshot(previewContext) : null),
    [previewContext]
  );
  const weeklyReportPayload = useMemo(
    () =>
      previewContext
        ? {
            role: "parent" as const,
            snapshot: buildParentWeeklyReportSnapshot(previewContext),
          }
        : null,
    [previewContext]
  );
  const weeklyReportKey = useMemo(
    () => (weeklyReportPayload ? JSON.stringify(weeklyReportPayload) : null),
    [weeklyReportPayload]
  );
  const homeTransparencyModel = useMemo(
    () =>
      feed && previewContext
        ? buildParentHomeTransparencyModel({
            context: previewContext,
            suggestionResult: previewResult,
            weeklyReport,
            weeklyReportError,
            latestConsultation,
            pendingFeedback: !feed.hasFeedbackToday,
          })
        : null,
    [feed, latestConsultation, previewContext, previewResult, weeklyReport, weeklyReportError]
  );

  useEffect(() => {
    if (!previewContext || !snapshot) return;

    let cancelled = false;
    const controller = new AbortController();
    const context = previewContext;
    const snapshotPayload = snapshot;

    async function fetchPreview() {
      try {
        const response = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: snapshotPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("fetch preview failed");
        }

        const data = (await response.json()) as AiSuggestionResponse;
        if (!cancelled) {
          setPreviewResult(buildParentAgentSuggestionResult({ context, suggestion: data }));
        }
      } catch {
        if (!cancelled) {
          const fallback = buildFallbackSuggestion(snapshotPayload);
          setPreviewResult(buildParentAgentSuggestionResult({ context, suggestion: fallback }));
        }
      }
    }

    void fetchPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewContext, snapshot]);

  useEffect(() => {
    const payload = weeklyReportPayload;
    const key = weeklyReportKey;
    if (!payload || !key) return;
    const cacheKey = key;
    const nextPayload = payload;

    const cached = weeklyReportCacheRef.current.get(cacheKey);
    if (cached) {
      setWeeklyReport(cached);
      setWeeklyReportError(null);
      setWeeklyReportLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadWeeklyReportPreview() {
      setWeeklyReportLoading(true);
      setWeeklyReportError(null);

      try {
        const data = await fetchWeeklyReport(nextPayload, {
          signal: controller.signal,
        });

        if (!cancelled) {
          weeklyReportCacheRef.current.set(cacheKey, data);
          setWeeklyReport(data);
        }
      } catch (requestError) {
        if (!cancelled && !controller.signal.aborted) {
          setWeeklyReportError(
            requestError instanceof Error ? requestError.message : "家长周报预览暂时不可用。"
          );
        }
      } finally {
        if (!cancelled) {
          setWeeklyReportLoading(false);
        }
      }
    }

    void loadWeeklyReportPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [weeklyReportKey, weeklyReportPayload]);

  if (!viewModel || !feed || !previewContext) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<BrainCircuit className="h-6 w-6" />}
          title={invalidChildId ? "无权查看该孩子的数据。" : "当前家长账号还没有可展示的孩子数据。"}
          description={
            invalidChildId
              ? "当前家长账号没有该 childId 的授权，系统不会自动回退到其他孩子。"
              : "请先使用示例家长账号，或完成普通家长账号的孩子建档。"
          }
        />
      </div>
    );
  }

  const agentHref = `/parent/agent?child=${feed.child.id}`;
  const storybookHref = `/parent/storybook?child=${feed.child.id}`;
  const primaryAgentLabel = previewResult ? "继续追问" : "进入 AI 助手";
  const displayInterventionCard = latestInterventionCard ?? previewResult?.interventionCard;
  const displayTonightTaskTitle = displayInterventionCard?.title ?? viewModel.tonightTask.title;
  const displayTonightTaskDescription =
    displayInterventionCard?.tonightHomeAction ??
    previewResult?.tonightTopAction ??
    viewModel.tonightTask.description;
  const displayWhyRecommended =
    sanitizeParentFacingText(latestConsultation?.summary) ||
    sanitizeParentFacingText(previewResult?.whyNow) ||
    "系统综合最近 7 天观察、园内风险和家庭反馈，优先给出今晚最值得执行的一件事。";
  const displayPreviewWhyNow = sanitizeParentFacingText(previewResult?.whyNow) || displayWhyRecommended;
  const displayReviewIn48h =
    latestConsultation?.followUp48h?.[0] ??
    displayInterventionCard?.reviewIn48h ??
    "48 小时内继续观察今晚任务执行后的变化。";
  const recentCriticalReminder = previewResult?.title ?? viewModel.aiReminder.title;
  const careFocusSpeechText = buildParentSpeechScript({
    title: `${feed.child.name} 关怀模式摘要`,
    sections: [
      { label: "今晚做什么", text: displayTonightTaskDescription },
      { label: "明天看什么", text: displayReviewIn48h },
      { label: "最近一次关键提醒", text: recentCriticalReminder },
    ],
    outro: "浏览器播报，仅用于当前设备预览，不是后端真实语音。",
  });
  const reminderSpeechText = buildParentSpeechScript({
    title: "AI 今日提醒",
    sections: [
      { label: "提醒", text: previewResult?.title ?? viewModel.aiReminder.title },
      { label: "为什么现在看", text: displayPreviewWhyNow },
    ],
    outro: "浏览器播报，仅用于当前设备预览，不是后端真实语音。",
  });
  const childMeta = `${viewModel.child.className} · ${getAgeText(
    viewModel.child.birthDate
  )} · 出生于 ${formatDisplayDate(viewModel.child.birthDate)}`;
  const latestHealthCheck = previewContext.weeklyHealthChecks[0];
  const latestMeal =
    [...previewContext.todayMeals].sort(
      (left, right) => (PARENT_MEAL_PRIORITY[right.meal] ?? 0) - (PARENT_MEAL_PRIORITY[left.meal] ?? 0)
    )[0] ?? previewContext.weeklyMeals[0];
  const latestMealFoodSummary =
    latestMeal?.foods
      .map((food) => `${food.name}${food.amount ? `(${food.amount})` : ""}`)
      .join("、") ?? "";
  const latestGrowthRecord = previewContext.weeklyGrowthRecords[0];
  const latestFeedback = previewContext.latestFeedback;
  const childScopedMessages =
    parentHomeData?.messages ?? messages.filter((message) => message.childId === feed.child.id);
  const childScopedReminders =
    parentHomeData?.reminders ??
    reminders.filter((reminder) => reminder.childId === feed.child.id || reminder.targetId === feed.child.id);
  const childScopedMenus =
    parentHomeData?.nutritionMenus ??
    nutritionMenus.filter((menu) => menu.classId === feed.child.className);
  const childScopedStorybooks =
    parentHomeData?.storybooks ?? storybooks.filter((storybook) => storybook.childId === feed.child.id);
  const savedStorybookCount = childScopedStorybooks.length;
  const unreadMessageCount = childScopedMessages.filter(
    (message) => !message.readBy.includes(currentUser.id) && message.senderId !== currentUser.id
  ).length;
  const pendingReminderCount = childScopedReminders.filter((reminder) => reminder.status === "pending").length;
  const todayMenu = childScopedMenus.find((menu) => menu.date === new Date().toISOString().slice(0, 10)) ?? childScopedMenus[0];
  const hasHealthWarning = previewContext.weeklyHealthChecks.some((item) => item.isAbnormal);
  const hasPendingFeedback = viewModel.pendingFeedback.status === "pending";
  const parentStatusLabel = hasPendingFeedback
    ? "今晚待反馈"
    : hasHealthWarning
      ? "需留意晨检"
      : "今日状态稳定";
  const parentStatusVariant = hasPendingFeedback
    ? "warning"
    : hasHealthWarning
      ? "warning"
      : "success";
  const todayTimelineItems: ParentTimelineItem[] = [
    {
      id: "health",
      title: "晨检结果",
      meta: latestHealthCheck ? formatDisplayDate(latestHealthCheck.date) : "今日暂无晨检",
      description: latestHealthCheck
        ? `${latestHealthCheck.temperature.toFixed(1)}°C · 情绪${latestHealthCheck.mood} · 手口眼${latestHealthCheck.handMouthEye}${latestHealthCheck.remark ? ` · ${latestHealthCheck.remark}` : ""}`
        : "当前还没有同步到晨检记录。",
      tone: latestHealthCheck?.isAbnormal ? "amber" : "emerald",
      icon: <CheckCircle2 className="h-4 w-4" />,
      status: latestHealthCheck
        ? latestHealthCheck.isAbnormal
          ? "需关注"
          : "正常"
        : "暂无",
      statusVariant: latestHealthCheck?.isAbnormal ? "warning" : latestHealthCheck ? "success" : "secondary",
    },
    {
      id: "health-material",
      title: "健康材料摘要",
      meta: latestHealthMaterial ? "本地演示解析 · 已保存" : "暂无健康材料解析",
      description: latestHealthMaterial
        ? `${latestHealthMaterialSummary || "老师已保存健康材料摘要。"}${latestHealthMaterialFollowUp ? ` · 复查建议：${latestHealthMaterialFollowUp}` : ""}`
        : "老师保存健康材料解析后，这里会展示家长可见摘要。",
      tone: latestHealthMaterial ? "amber" : "emerald",
      icon: <HeartPulse className="h-4 w-4" />,
      status: latestHealthMaterial ? "已同步" : "暂无",
      statusVariant: latestHealthMaterial ? "warning" : "secondary",
    },
    {
      id: "meal",
      title: "饮食摘要",
      meta: latestMeal ? `${formatDisplayDate(latestMeal.date)} · ${latestMeal.meal}` : "今日暂无饮食记录",
      description: latestMeal
        ? `${latestMeal.foods.map((food) => `${food.name}${food.amount ? `(${food.amount})` : ""}`).join("、")} · 饮水 ${latestMeal.waterMl} ml · 营养评分 ${latestMeal.nutritionScore}`
        : "还没有可展示的餐食记录。",
      tone: latestMeal?.allergyReaction ? "amber" : "sky",
      icon: <CalendarDays className="h-4 w-4" />,
      status: latestMeal?.allergyReaction ? "有过敏提示" : latestMeal ? "已记录" : "暂无",
      statusVariant: latestMeal?.allergyReaction ? "warning" : latestMeal ? "info" : "secondary",
    },
    {
      id: "growth",
      title: "成长动态",
      meta: latestGrowthRecord ? formatTimelineTime(latestGrowthRecord.createdAt) : "今日暂无成长记录",
      description: latestGrowthRecord?.description ?? "还没有可展示的成长观察。",
      tone: latestGrowthRecord?.needsAttention ? "amber" : "emerald",
      icon: <BookOpenText className="h-4 w-4" />,
      status: latestGrowthRecord?.needsAttention ? "需继续观察" : latestGrowthRecord ? "稳定亮点" : "暂无",
      statusVariant: latestGrowthRecord?.needsAttention ? "warning" : latestGrowthRecord ? "success" : "secondary",
    },
    {
      id: "feedback",
      title: "老师反馈 / 家庭反馈",
      meta: latestFeedback ? formatDisplayDate(latestFeedback.date) : "今晚可补一条反馈",
      description:
        latestFeedback?.content ??
        (previewResult?.feedbackPrompt ?? viewModel.pendingFeedback.description),
      tone: hasPendingFeedback ? "amber" : "indigo",
      icon: <MessageCircleMore className="h-4 w-4" />,
      status: hasPendingFeedback ? "待提交" : "已同步",
      statusVariant: hasPendingFeedback ? "warning" : "success",
    },
  ];
  const weeklySignals: ParentWeeklySignal[] = [
    {
      label: "近 7 天饮食记录",
      value: `${previewContext.weeklyMeals.length} 条`,
      helper: `均衡率 ${previewContext.weeklyTrend.balancedRate}% · 蔬菜 ${previewContext.weeklyTrend.vegetableDays} 天`,
      tone: "sky",
    },
    {
      label: "晨检记录",
      value: `${previewContext.weeklyHealthChecks.length} 天`,
      helper: hasHealthWarning ? "出现过异常记录，今晚继续留意。" : "近 7 天晨检整体平稳。",
      tone: hasHealthWarning ? "amber" : "emerald",
    },
    {
      label: "成长记录",
      value: `${previewContext.weeklyGrowthRecords.length} 条`,
      helper: `${previewContext.attentionGrowthRecords.length} 条需继续观察`,
      tone: previewContext.attentionGrowthRecords.length > 0 ? "amber" : "emerald",
    },
    {
      label: "家庭反馈",
      value: `${previewContext.weeklyFeedbacks.length} 条`,
      helper: hasPendingFeedback ? "今晚还缺一条执行反馈。" : "最近反馈已进入闭环。",
      tone: hasPendingFeedback ? "amber" : "indigo",
    },
  ];

  const headerActions = (
    <>
      <CareModeToggle careMode={careMode} onChange={setCareMode} />
      <InlineLinkButton href={agentHref} label={primaryAgentLabel} variant="premium" />
      <InlineLinkButton href={`${agentHref}#feedback`} label="今晚做完后去反馈" />
    </>
  );

  const growthAndMediaSection = (
    <SectionCard
      title="成长行为与影像记录"
      description="恢复到孩子维度的真实记录流，家长在首页就能看到今天和最近几天的成长观察与影像。"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          {viewModel.growthTimeline.length > 0 ? (
            viewModel.growthTimeline.map((item) => (
              <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatTimelineTime(item.recordedAt)}</p>
                  </div>
                  <Badge variant={item.needsAttention ? "warning" : "success"}>
                    {item.needsAttention ? "需继续观察" : "稳定亮点"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.slice(0, 4).map((tag) => (
                    <Badge key={`${item.id}-${tag}`} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              当前还没有可展示的成长行为记录。
            </div>
          )}
        </div>
        <div className="space-y-3">
          {viewModel.mediaGallery.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {viewModel.mediaGallery.slice(0, 4).map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
                    <div className="relative aspect-[4/3] bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <Badge variant={item.source === "meal" ? "info" : "secondary"}>
                          {item.source === "meal" ? "餐食图" : "成长影像"}
                        </Badge>
                      </div>
                      <p className="text-xs leading-5 text-slate-500">{item.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                这里只展示当前孩子可看的影像与记录，不会带出其他孩子的信息。
              </p>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              当前还没有可展示的图片或影像记录。
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );

  const storybookEntrySection = (
    <SectionCard
      title="今日成长小故事"
      description="把今天的亮点写成 3 屏睡前绘本，家长在手机上滑一下就能看完。"
      actions={<Badge variant={savedStorybookCount > 0 ? "success" : "secondary"}>{savedStorybookCount > 0 ? `已保存 ${savedStorybookCount} 本` : "微绘本入口"}</Badge>}
    >
      <div className="rounded-[28px] border border-amber-100 bg-linear-to-br from-amber-50 via-white to-sky-50 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <BookOpenText className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-900">{feed.child.name} 的晚安小绘本</p>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
              今天的成长记录、家庭任务和最近会诊会被整理成一页更好读的故事。先看完，再决定今晚只做哪一件小事。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info">3 屏微绘本</Badge>
              <Badge variant="secondary">插图 / 配音预览</Badge>
              <Badge variant={latestConsultation ? "warning" : "success"}>
                {latestConsultation ? "复用会诊上下文" : "自动提取亮点"}
              </Badge>
            </div>
            <div className="mt-5">
              <InlineLinkButton href={storybookHref} label="打开今日微绘本" variant="premium" />
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const parentReferenceDate =
    [
      ...healthCheckRecords.filter((record) => record.childId === feed.child.id).map((record) => parentDateKey(record.date)),
      ...mealRecords.filter((record) => record.childId === feed.child.id).map((record) => parentDateKey(record.date)),
      ...growthRecords.filter((record) => record.childId === feed.child.id).map((record) => parentDateKey(record.createdAt)),
      ...guardianFeedbacks.filter((record) => record.childId === feed.child.id).map((record) => parentDateKey(record.date)),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
  const parentRecentDates = Array.from({ length: 7 }, (_, index) => parentAddDays(parentReferenceDate, index - 6));
  const parentTrendRows: ReplicaChartDatum[] = parentRecentDates.map((date) => {
    const dayMeals = mealRecords.filter((record) => record.childId === feed.child.id && parentDateKey(record.date) === date);
    const dayHealth = healthCheckRecords.filter((record) => record.childId === feed.child.id && parentDateKey(record.date) === date);
    return {
      label: date.slice(5),
      health: average(dayHealth.map((record) => record.temperature)),
      diet: average(dayMeals.map((record) => record.nutritionScore)),
      growth: growthRecords.filter((record) => record.childId === feed.child.id && parentDateKey(record.createdAt) === date).length,
      feedback: guardianFeedbacks.filter((record) => record.childId === feed.child.id && parentDateKey(record.date) === date).length,
      reminders: reminders.filter(
        (record) =>
          (record.childId === feed.child.id || record.targetId === feed.child.id) &&
          parentDateKey(record.scheduledAt) === date
      ).length,
    };
  });

  const weeklyTrendSection = (
    <SectionCard
      title="近 7 天记录与趋势"
      description="保留饮食、晨检、成长和反馈的关键记录数，家长先看结论，需要细问再进入趋势问答。"
      actions={<InlineLinkButton href={agentHref} label="进入趋势与追问" />}
    >
      <ParentWeeklySignalGrid items={weeklySignals} />
      <div className="mt-5">
        <ReplicaComboChart
          data={parentTrendRows}
          testId="r03-parent-weekly-trend"
          series={[
            { key: "health", label: "健康趋势", color: replicaChartColors.green, kind: "line", unit: "°C" },
            { key: "diet", label: "饮食趋势", color: replicaChartColors.amber, kind: "line", unit: "分" },
            { key: "growth", label: "成长行为", color: replicaChartColors.primary, unit: "条" },
            { key: "feedback", label: "反馈状态", color: replicaChartColors.sky, unit: "条" },
            { key: "reminders", label: "提醒状态", color: replicaChartColors.red, unit: "条" },
          ]}
        />
      </div>
    </SectionCard>
  );

  const interventionPreviewSection = (
    <SectionCard title="最近一张 AI 干预卡预览" description="首页先露出一张真实干预卡，让家长清楚今晚怎么做。">
      <Link
        href={`${agentHref}#intervention`}
        className="block rounded-3xl border border-slate-100 bg-white p-5 transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <p className="text-sm font-semibold text-slate-900">
            {displayInterventionCard?.title ?? viewModel.interventionPreview.title}
          </p>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {displayInterventionCard?.summary ?? viewModel.interventionPreview.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(displayInterventionCard?.observationPoints ?? []).slice(0, 2).map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      </Link>
    </SectionCard>
  );

  const viewOrderSection = (
    <SectionCard title="今日查看顺序" description="更适合移动端首页的操作顺序。">
      <ol className="space-y-3 text-sm text-slate-600">
        <li className="flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-indigo-500" />
          先看今日情况摘要
        </li>
        <li className="flex items-center gap-3">
          <BrainCircuit className="h-4 w-4 text-indigo-500" />
          再看 AI 干预卡预览
        </li>
        <li className="flex items-center gap-3">
          <MoonStar className="h-4 w-4 text-indigo-500" />
          今晚按家庭动作执行并反馈
        </li>
      </ol>
    </SectionCard>
  );

  const moreContentToggle = (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-900">更多内容</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这里保留周报、透明说明、趋势入口、微绘本和完整记录。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-2xl px-4 text-base"
          onClick={() => setShowMoreContent((current) => !current)}
        >
          {showMoreContent ? "收起更多内容" : "展开更多内容"}
        </Button>
      </div>
    </div>
  );

  if (careMode) {
    return (
      <RolePageShell
        badge={`家长首页 · ${TODAY_TEXT}`}
        title={`先看 ${viewModel.child.name} 今晚要做什么`}
        description="关怀模式会把首屏压缩成一件事、一句话和最短主链路，帮助祖辈或低数字熟练度照护者更快看懂。"
        headerVariant="hidden"
        className="max-w-[84rem]"
        actions={headerActions}
      >
        <RoleSplitLayout
          stacked
          main={
            <div className="space-y-6">
              <ParentCareFocusCard
                badge="关怀模式"
                title={`${feed.child.name} 今晚先看这一件事`}
                description="先看今晚做什么，再看明天老师会继续看什么，最后再补充完整原因。"
                items={[
                  {
                    label: "今晚做什么",
                    value: displayTonightTaskDescription,
                    tone: "sky",
                  },
                  {
                    label: "明天看什么",
                    value: displayReviewIn48h,
                    tone: "emerald",
                  },
                  {
                    label: "最近一次关键提醒",
                    value: recentCriticalReminder,
                    tone: "amber",
                  },
                ]}
                actions={
                  <>
                    <ParentSpeakButton
                      text={careFocusSpeechText}
                      careMode
                      variant="secondary"
                    />
                    <InlineLinkButton href={agentHref} label="去看今晚怎么做" variant="premium" />
                    <InlineLinkButton href={`${agentHref}#feedback`} label="做完后去反馈" />
                  </>
                }
              />

              <SectionCard title="一句话提醒" description="先告诉你现在最重要的一件事。">
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
                  <ParentSpeakButton
                    text={reminderSpeechText}
                    label="读给我听"
                    careMode
                    variant="secondary"
                    className="mb-4"
                  />
                  <p className="text-lg font-semibold leading-9 text-slate-900">
                    {previewResult?.title ?? viewModel.aiReminder.title}
                  </p>
                  <p className="mt-3 text-base leading-8 text-slate-700">
                    {displayPreviewWhyNow}
                  </p>
                </div>
              </SectionCard>

              {moreContentToggle}

              {showMoreContent ? (
                <div className="space-y-6">
                  <SectionCard title="孩子基本信息" description="需要时再看详细资料。">
                    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-base font-semibold text-slate-900">{viewModel.child.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {viewModel.child.className} · {getAgeText(viewModel.child.birthDate)} · 出生于{" "}
                        {formatDisplayDate(viewModel.child.birthDate)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {viewModel.child.allergies.length > 0 ? (
                          viewModel.child.allergies.map((item) => (
                            <Badge key={item} variant="warning">
                              过敏：{item}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="success">暂无过敏重点</Badge>
                        )}
                      </div>
                    </div>
                  </SectionCard>

                  {homeTransparencyModel ? (
                    <ParentTransparencyPanel
                      model={homeTransparencyModel}
                      title="为什么会看到这条建议"
                      description="把当前建议、周报和跟进状态的来源说明压缩成家长看得懂的一层。"
                      careMode
                    />
                  ) : null}

                  {interventionPreviewSection}

                  <WeeklyReportPreviewCard
                    title="本周家庭周报预览"
                    description="只看最关键的一条家庭动作和本周变化。"
                    role="parent"
                    periodLabel={weeklyReportPayload?.snapshot.periodLabel ?? "近 7 天"}
                    report={weeklyReport}
                    loading={weeklyReportLoading}
                    error={weeklyReportError}
                    ctaHref={`${agentHref}#feedback`}
                    ctaLabel="去反馈本周变化"
                    ctaVariant="secondary"
                    careMode
                  />

                  <SectionCard title="统一意图入口" description="需要时再说出你的问题。">
                    <UnifiedIntentEntryCard
                      roleHint="parent"
                      sourcePage="/parent"
                      title="一句话让家长助手直接给出入口"
                      placeholder="例如：我今晚该做什么，或我想看孩子最近趋势"
                      examples={[
                        "我今晚该做什么",
                        "我想看孩子最近趋势",
                        "打开今晚的微绘本",
                      ]}
                      childId={feed.child.id}
                      compact
                    />
                  </SectionCard>

                  {storybookEntrySection}
                  {growthAndMediaSection}
                  {weeklyTrendSection}
                  {viewOrderSection}
                </div>
              ) : null}
            </div>
          }
          aside={null}
        />
      </RolePageShell>
    );
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const latestAttendance =
    attendanceRecords.find((record) => record.childId === feed.child.id && record.date === todayKey) ??
    attendanceRecords
      .filter((record) => record.childId === feed.child.id)
      .sort((left, right) => right.date.localeCompare(left.date))[0];
  const pixelTrendPoints: ParentPixelTrendPoint[] = parentRecentDates.map((date) => {
    const health = healthCheckRecords.find((record) => record.childId === feed.child.id && record.date === date);
    const dayMeals = mealRecords.filter((record) => record.childId === feed.child.id && record.date === date);
    const growthCount = growthRecords.filter(
      (record) => record.childId === feed.child.id && record.createdAt.slice(0, 10) === date
    ).length;
    const mealCount = dayMeals.length;
    const feedbackCount = guardianFeedbacks.filter((record) => record.childId === feed.child.id && record.date === date).length;
    const reminderCount = childScopedReminders.filter((record) => record.scheduledAt.slice(0, 10) === date).length;

    return {
      day: new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      }),
      temp: health?.temperature ?? null,
      mood: health ? Math.min(4.4, 3 + growthCount * 0.2 + mealCount * 0.1) : null,
      mealScore: average(dayMeals.map((record) => record.nutritionScore)),
      growthCount,
      feedbackCount,
      reminderCount,
    };
  });
  const latestTeacherMessage = [...childScopedMessages]
    .filter((message) => message.senderId !== currentUser.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const latestPendingReminder = [...childScopedReminders]
    .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt))[0];
  const pixelStatusItems: ParentPixelStatusItem[] = [
    {
      id: "arrival",
      label: "入园",
      value: latestAttendance?.checkInAt
        ? new Date(latestAttendance.checkInAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        : latestAttendance?.isPresent
          ? "已入园"
          : "暂无",
      helper: latestAttendance?.isPresent ? "来自出勤记录" : "无出勤记录",
      tone: latestAttendance?.isPresent ? "blue" : "sky",
    },
    {
      id: "temp",
      label: "体温",
      value: latestHealthCheck ? `${latestHealthCheck.temperature.toFixed(1)}°C` : "暂无",
      helper: latestHealthCheck ? (latestHealthCheck.isAbnormal ? "需关注" : "晨检记录") : "无晨检记录",
      tone: latestHealthCheck?.isAbnormal ? "orange" : "green",
    },
    {
      id: "meal",
      label: "饮食",
      value: latestMeal ? `${latestMeal.nutritionScore}分` : todayMenu ? "有餐谱" : "暂无",
      helper: latestMeal?.allergyReaction
        ? `过敏提示${latestMealFoodSummary ? ` · ${latestMealFoodSummary}` : ""}`
        : latestMeal
          ? latestMealFoodSummary || "饮食记录"
          : todayMenu
            ? "演示餐谱"
            : "无饮食记录",
      tone: latestMeal?.allergyReaction ? "orange" : "orange",
    },
    {
      id: "nap",
      label: "沟通",
      value: unreadMessageCount > 0 ? `${unreadMessageCount}条未读` : `${childScopedMessages.length}条`,
      helper: latestTeacherMessage ? "老师反馈" : "无新反馈",
      tone: "violet",
    },
    {
      id: "activity",
      label: "提醒",
      value: pendingReminderCount > 0 ? `${pendingReminderCount}条待读` : `${childScopedReminders.length}条`,
      helper: latestPendingReminder ? "来自提醒数据" : "无提醒",
      tone: "sky",
    },
  ];
  const pixelReminders: ParentPixelReminderItem[] = [
    ...(latestHealthMaterial
      ? [
          {
            id: "health-material",
            time: new Date(latestHealthMaterial.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
            author: "健康材料",
            content: `健康材料摘要：${latestHealthMaterialSummary || "本地演示解析结果已保存。"}${latestHealthMaterialFollowUp ? ` 复查建议：${latestHealthMaterialFollowUp}` : ""}`,
            unread: false,
          },
        ]
      : []),
    ...childScopedMessages
      .filter((message) => message.senderId !== currentUser.id)
      .slice(-2)
      .reverse()
      .map((message) => ({
        id: message.messageId,
        time: new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        author: message.senderName,
        content: message.content,
        unread: !message.readBy.includes(currentUser.id),
      })),
    ...childScopedReminders
      .filter((reminder) => reminder.status === "pending")
      .slice(0, 2)
      .map((reminder) => ({
        id: reminder.reminderId,
        time: new Date(reminder.scheduledAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        author: "日常提醒",
        content: `${reminder.title}：${reminder.description}`,
        unread: true,
      })),
  ].slice(0, 3);
  const pixelGrowthImages: ParentPixelGrowthImage[] = viewModel.mediaGallery
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      title: item.title,
      src: item.thumbnailUrl,
    }));

  if (!careMode) {
    return (
      <RolePageShell
        badge={`家长首页 · ${TODAY_TEXT}`}
        title={`先看 ${viewModel.child.name} 今天的状态，再决定今晚怎么做`}
        description="首页只保留今天最需要处理的信息：孩子状态、AI 提醒、今晚任务、反馈入口和移动端趋势。"
        headerVariant="hidden"
        className="max-w-[78rem]"
      >
        <PixelParentHomeReplica
          todayText={TODAY_TEXT}
          currentUserName={currentUser.name}
          childName={viewModel.child.name}
          childMeta={childMeta}
          allergies={viewModel.child.allergies}
          statusLabel={parentStatusLabel}
          statusVariant={parentStatusVariant}
          careMode={careMode}
          onCareModeChange={setCareMode}
          agentHref={agentHref}
          storybookHref={storybookHref}
          switchChildHref={`/parent?child=${feed.child.id}`}
          reminderSpeechText={reminderSpeechText}
          statusItems={pixelStatusItems}
          reminders={pixelReminders}
          aiTitle={previewResult?.title ?? viewModel.aiReminder.title}
          aiDescription={displayPreviewWhyNow}
          tonightTitle={displayTonightTaskTitle}
          tonightDescription={displayTonightTaskDescription}
          whyRecommended={displayWhyRecommended}
          teacherFocus={displayReviewIn48h}
          growthImages={pixelGrowthImages}
          trendPoints={pixelTrendPoints}
          hasPendingFeedback={hasPendingFeedback}
        />
      </RolePageShell>
    );
  }

  return (
    <RolePageShell
      badge={`家长首页 · ${TODAY_TEXT}`}
      title={`先看 ${viewModel.child.name} 今天的状态，再决定今晚怎么做`}
      description="首页只保留今天最需要处理的信息：孩子状态、AI 提醒、今晚任务、AI 干预卡预览、待反馈事项和 7 天趋势入口。"
      headerVariant="hidden"
      className="max-w-[84rem]"
      actions={headerActions}
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[2rem] border border-sky-100 bg-[linear-gradient(150deg,#fff7ed_0%,#f0f9ff_44%,#f5f3ff_100%)] p-4 shadow-[0_22px_64px_rgb(14_165_233_/_0.14)] sm:p-5">
              <div className="grid gap-4">
                <div className="rounded-[1.75rem] border border-white/82 bg-white/84 p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] bg-[linear-gradient(135deg,#7dd3fc,#a7f3d0)] text-2xl font-bold text-white shadow-[0_16px_36px_rgb(14_165_233_/_0.25)] sm:h-16 sm:w-16">
                        {viewModel.child.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="info" className="rounded-full px-3 py-1">
                            {TODAY_TEXT}
                          </Badge>
                          <Badge variant={parentStatusVariant}>{parentStatusLabel}</Badge>
                        </div>
                        <h1 className="mt-2 text-xl font-semibold leading-tight text-slate-950 sm:mt-3 sm:text-3xl">
                          {viewModel.child.name} 的今日状态
                        </h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{childMeta}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {viewModel.child.allergies.length > 0 ? (
                            viewModel.child.allergies.map((item) => (
                              <Badge key={item} variant="warning">
                                过敏：{item}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="success">暂无过敏重点</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <CareModeToggle careMode={careMode} onChange={setCareMode} variant="compact" />
                  </div>

                  <div className="mt-4 grid grid-cols-5 gap-2 sm:mt-5 sm:gap-3">
                    {[
                      {
                        label: "晨检",
                        value: latestHealthCheck ? `${latestHealthCheck.temperature.toFixed(1)}°C` : "暂无",
                        icon: <HeartPulse className="h-5 w-5" />,
                        tone: latestHealthCheck?.isAbnormal ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
                      },
                      {
                        label: "饮食",
                        value: latestMeal ? `${latestMeal.nutritionScore} 分` : "暂无",
                        icon: <Utensils className="h-5 w-5" />,
                        tone: "bg-sky-50 text-sky-700",
                      },
                      {
                        label: "成长",
                        value: `${feed.todayGrowth.length} 条`,
                        icon: <BookOpenText className="h-5 w-5" />,
                        tone: "bg-violet-50 text-violet-700",
                      },
                      {
                        label: "反馈",
                        value: hasPendingFeedback ? "待提交" : "已同步",
                        icon: <MessageCircleMore className="h-5 w-5" />,
                        tone: hasPendingFeedback ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
                      },
                      {
                        label: "趋势",
                        value: `${previewContext.weeklyMeals.length} 条`,
                        icon: <TrendingUp className="h-5 w-5" />,
                        tone: "bg-indigo-50 text-indigo-700",
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/82 bg-white/78 p-2 text-center shadow-sm sm:p-3">
                        <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-2xl sm:h-10 sm:w-10 ${item.tone}`}>
                          {item.icon}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 sm:mt-2 sm:text-xs">{item.label}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-950 sm:mt-1 sm:text-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
                    <Button asChild variant="premium" className="min-h-11 rounded-2xl">
                      <Link href={agentHref}>看今晚怎么做</Link>
                    </Button>
                    <Button asChild variant="outline" className="min-h-11 rounded-2xl">
                      <Link href={`${agentHref}#feedback`}>做完去反馈</Link>
                    </Button>
                    <Button asChild variant="outline" className="col-span-2 hidden min-h-11 rounded-2xl sm:inline-flex">
                      <Link href={storybookHref}>打开成长绘本</Link>
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-white/82 bg-white/76 p-5 shadow-sm xl:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-slate-950">AI 今晚建议</p>
                        <p className="mt-1 text-xs text-slate-500">只保留一件可执行的家庭动作</p>
                      </div>
                    </div>
                    <ParentSpeakButton text={reminderSpeechText} label="播报" />
                  </div>
                  <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/68 p-4">
                    <p className="text-base font-semibold leading-7 text-slate-950">
                      {previewResult?.title ?? viewModel.aiReminder.title}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {displayPreviewWhyNow}
                    </p>
                  </div>
                  <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <MoonStar className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{displayTonightTaskTitle}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{displayTonightTaskDescription}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <ParentTimelineCard
              title="今天先看这 4 件事"
              description="按家长查看顺序整理晨检、饮食、成长动态和反馈状态，手机上从上往下读即可。"
              items={todayTimelineItems}
            />

            <div className="grid gap-3 md:grid-cols-3">
              <ParentActionCard
                title="今晚怎么做"
                description="直接进入家长助手，看一条温和、可执行的家庭动作。"
                href={agentHref}
                actionLabel="查看建议"
                tone="indigo"
                icon={<BrainCircuit className="h-5 w-5" />}
              />
              <ParentActionCard
                title="做完去反馈"
                description="提交是否执行、孩子反应和补充说明，明天老师继续跟进。"
                href={`${agentHref}#feedback`}
                actionLabel="提交反馈"
                tone="amber"
                icon={<MessageCircleMore className="h-5 w-5" />}
              />
              <ParentActionCard
                title="读成长绘本"
                description="把成长记录整理成更轻的亲子阅读视图。"
                href={storybookHref}
                actionLabel="打开绘本"
                tone="emerald"
                icon={<BookOpenText className="h-5 w-5" />}
              />
            </div>

            <SectionCard
              title="AI 今日提醒"
              description="优先看当前最值得家长马上处理的一条提示。"
              actions={
                <Badge variant={viewModel.aiReminder.level === "warning" ? "warning" : "info"}>
                  {viewModel.aiReminder.level === "warning" ? "需关注" : "今日建议"}
                </Badge>
              }
            >
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                <ParentSpeakButton
                  text={reminderSpeechText}
                  label="浏览器播报"
                  className="mb-4"
                />
                <p className="text-base font-semibold text-slate-900">
                  {previewResult?.title ?? viewModel.aiReminder.title}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {displayPreviewWhyNow || viewModel.aiReminder.description}
                </p>
              </div>
            </SectionCard>

            {homeTransparencyModel ? (
              <ParentTransparencyPanel
                model={homeTransparencyModel}
                title="为什么会看到这条建议"
                description="把当前建议、周报和跟进状态的来源说明压缩成家长看得懂的一层。"
              />
            ) : null}

            {storybookEntrySection}

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="今晚家庭任务"
                description="今晚先做一件最适合当前状态的动作。"
                actions={
                  <Badge variant={latestConsultation ? "warning" : "info"}>
                    {latestConsultation ? "会诊闭环任务" : viewModel.tonightTask.tag}
                  </Badge>
                }
              >
                <div className="rounded-3xl bg-sky-50 p-5">
                  <div className="flex items-start gap-3">
                    <MoonStar className="mt-0.5 h-5 w-5 text-sky-600" />
                    <div>
                      <p className="text-base font-semibold text-slate-900">{displayTonightTaskTitle}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{displayTonightTaskDescription}</p>
                      <p className="mt-3 text-sm font-medium text-sky-700">
                        建议时长：{viewModel.tonightTask.durationText}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        为什么推荐：{displayWhyRecommended}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        48 小时内复查：{displayReviewIn48h}
                      </p>
                      <Link
                        href={`${agentHref}#intervention`}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-700"
                      >
                        查看完整干预卡
                        <TrendingUp className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="待反馈事项"
                description="让家长知道今晚是否还需要补一条反馈。"
                actions={
                  <Badge
                    variant={
                      viewModel.pendingFeedback.status === "pending" ? "warning" : "success"
                    }
                  >
                    {viewModel.pendingFeedback.status === "pending" ? "待提交" : "已同步"}
                  </Badge>
                }
              >
                <div className="rounded-3xl bg-amber-50 p-5">
                  <div className="flex items-start gap-3">
                    <MessageCircleMore className="mt-0.5 h-5 w-5 text-amber-600" />
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {viewModel.pendingFeedback.title}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {previewResult?.feedbackPrompt ?? viewModel.pendingFeedback.description}
                      </p>
                      <Link
                        href={`${agentHref}#feedback`}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-700"
                      >
                        去 AI 助手提交反馈
                        <TrendingUp className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {growthAndMediaSection}

            <ParentGentleNotice
              title="今晚不用一次看完全部内容"
              description="首页已经把关键提醒、家庭任务和反馈入口放在前面；周报和趋势可以等孩子休息后再细看。"
              action={<InlineLinkButton href={`${agentHref}#feedback`} label="先反馈今晚情况" />}
            />

            <WeeklyReportPreviewCard
              title="本周家庭周报预览"
              description="只讲本周变化、一个最重要的家庭动作和需反馈问题，不把首页改成大工作流页。"
              role="parent"
              periodLabel={weeklyReportPayload?.snapshot.periodLabel ?? "近 7 天"}
              report={weeklyReport}
              loading={weeklyReportLoading}
              error={weeklyReportError}
              ctaHref={`${agentHref}#feedback`}
              ctaLabel="去反馈本周变化"
              ctaVariant="secondary"
            />

            {weeklyTrendSection}
          </div>
        }
        aside={
          <div className="space-y-6">
            <UnifiedIntentEntryCard
              roleHint="parent"
              sourcePage="/parent"
              title="一句话让家长助手直接给出今晚入口"
              placeholder="例如：我今晚该做什么，或我想看孩子最近趋势"
              examples={["我今晚该做什么", "我想看孩子最近趋势", "打开今晚的微绘本"]}
              childId={feed.child.id}
              compact
            />

            {interventionPreviewSection}
            {viewOrderSection}
          </div>
        }
      />
    </RolePageShell>
  );
}
