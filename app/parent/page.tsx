"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenText,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  MessageCircleMore,
  MoonStar,
  TrendingUp,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import CareModeToggle from "@/components/parent/CareModeToggle";
import ParentCareFocusCard from "@/components/parent/ParentCareFocusCard";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import ParentTransparencyPanel from "@/components/parent/ParentTransparencyPanel";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
import {
  InlineLinkButton,
  MetricGrid,
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
import { buildParentHomeTransparencyModel } from "@/lib/agent/parent-transparency";
import { buildParentWeeklyReportSnapshot } from "@/lib/agent/parent-weekly-report";
import { resolveDefaultParentStoryBookDemoSeedId } from "@/lib/agent/parent-storybook-demo-seeds";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import type { AiSuggestionResponse, WeeklyReportResponse } from "@/lib/ai/types";
import { useCareMode } from "@/lib/care-mode";
import { buildParentSpeechScript } from "@/lib/voice/browser-tts";
import { buildParentHomeViewModel } from "@/lib/view-models/role-home";
import { formatDisplayDate, getAgeText, useApp } from "@/lib/store";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

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
  const {
    currentUser,
    getParentFeed,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    taskCheckInRecords,
    getChildInterventionCard,
    getLatestConsultationForChild,
  } = useApp();
  const { careMode, setCareMode } = useCareMode();
  const [showMoreContent, setShowMoreContent] = useState(false);
  const parentFeed = getParentFeed();
  const childFromQuery = searchParams.get("child");
  const authorizedChildIds = useMemo(
    () => new Set(parentFeed.map((item) => item.child.id)),
    [parentFeed]
  );
  const resolvedChildId =
    childFromQuery && authorizedChildIds.has(childFromQuery)
      ? childFromQuery
      : parentFeed[0]?.child.id ?? "";
  const feed = parentFeed.find((item) => item.child.id === resolvedChildId) ?? parentFeed[0];
  const viewModel = buildParentHomeViewModel(feed);
  const [previewResult, setPreviewResult] = useState<ParentAgentResult | null>(null);
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);
  const latestInterventionCard = feed ? getChildInterventionCard(feed.child.id) : undefined;
  const latestConsultation = feed ? getLatestConsultationForChild(feed.child.id) : undefined;

  useEffect(() => {
    if (!feed) {
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
  }, [feed, pathname, router, searchParams]);

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
          title="当前家长账号还没有可展示的孩子数据。"
          description="请先使用示例家长账号，或完成普通家长账号的孩子建档。"
        />
      </div>
    );
  }

  const agentHref = `/parent/agent?child=${feed.child.id}`;
  const storybookDemoSeedId = resolveDefaultParentStoryBookDemoSeedId({
    childId: feed.child.id,
    currentUserId: currentUser.id,
    accountKind: currentUser.accountKind,
  });
  const storybookHref = storybookDemoSeedId
    ? `/parent/storybook?child=${feed.child.id}&demoSeed=${storybookDemoSeedId}`
    : `/parent/storybook?child=${feed.child.id}`;
  const primaryAgentLabel = previewResult ? "继续追问" : "进入 AI 助手";
  const displayInterventionCard = latestInterventionCard ?? previewResult?.interventionCard;
  const displayTonightTaskTitle = displayInterventionCard?.title ?? viewModel.tonightTask.title;
  const displayTonightTaskDescription =
    displayInterventionCard?.tonightHomeAction ??
    previewResult?.tonightTopAction ??
    viewModel.tonightTask.description;
  const displayWhyRecommended =
    latestConsultation?.summary ??
    previewResult?.whyNow ??
    "系统综合最近 7 天观察、园内风险和家庭反馈，优先给出今晚最值得执行的一件事。";
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
      { label: "为什么现在看", text: previewResult?.whyNow ?? displayWhyRecommended },
    ],
    outro: "浏览器播报，仅用于当前设备预览，不是后端真实语音。",
  });

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
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 320px"
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
      actions={<Badge variant="success">微绘本入口</Badge>}
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

  const weeklyTrendSection = (
    <SectionCard
      title="最近 7 天趋势入口"
      description="给家长一个足够轻量的趋势摘要，避免首页变成报表页。"
      actions={<InlineLinkButton href={agentHref} label="进入趋势与追问" />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {viewModel.weeklyTrend.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
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
                    {previewResult?.whyNow ?? displayWhyRecommended}
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

  return (
    <RolePageShell
      badge={`家长首页 · ${TODAY_TEXT}`}
      title={`先看 ${viewModel.child.name} 今天的状态，再决定今晚怎么做`}
      description="首页只保留今天最需要处理的信息：孩子状态、AI 提醒、今晚任务、AI 干预卡预览、待反馈事项和 7 天趋势入口。"
      actions={headerActions}
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            <MetricGrid
              items={viewModel.todaySummary.map((item) => ({
                label: item.label,
                value: item.value,
                tone:
                  item.tone === "warning"
                    ? "amber"
                    : item.tone === "success"
                      ? "emerald"
                      : "sky",
              }))}
            />

            <SectionCard title="孩子今日情况摘要" description="先把家长最关心的几件事压缩到首屏。">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{viewModel.child.name}</p>
                  <p className="mt-2 text-sm text-slate-500">
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
                      <Badge variant="success">暂无过敏风险提示</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">今晚闭环重点</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <li>先看 AI 干预卡，再决定今晚只做哪一件事。</li>
                    <li>做完后直接在家长 Agent 页提交反馈，明天老师会继续接着看。</li>
                    <li>如果今晚有明显变化，直接进入 AI 助手继续追问。</li>
                  </ul>
                </div>
              </div>
            </SectionCard>

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
                  {previewResult?.whyNow ?? viewModel.aiReminder.description}
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
