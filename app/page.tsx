"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookHeart,
  CalendarDays,
  History,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import {
  InlineLinkButton,
  MetricGrid,
  RolePageShell,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  WeeklyReportResponse,
  WeeklyReportRole,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";
import { getLocalToday, isDateWithinLastDays, shiftLocalDate } from "@/lib/date";
import type { AdminBoardData } from "@/lib/store";
import { INSTITUTION_NAME, useApp } from "@/lib/store";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const TEMPLATE_ENTRIES = [
  {
    title: "早餐批量模板",
    description: "牛奶、鸡蛋与全麦主食的标准化组合，适合晨间快速录入。",
    foods: ["牛奶", "鸡蛋", "全麦面包"],
  },
  {
    title: "午餐均衡模板",
    description: "主食、蛋白与蔬果的常规配比，适合班级统一执行。",
    foods: ["米饭", "鸡肉", "西兰花"],
  },
  {
    title: "加餐轻量模板",
    description: "水果与奶制品的轻量场景，便于处理临时加餐。",
    foods: ["香蕉", "酸奶", "温水"],
  },
];

type BoardExposureView = Pick<
  AdminBoardData,
  "highAttentionChildren" | "lowHydrationChildren" | "lowVegTrendChildren"
>;

function dedupeBoardExposure(board: BoardExposureView): BoardExposureView {
  const seen = new Set<string>();

  const takeUnique = <T extends { childId: string }>(items: T[]) => {
    const next: T[] = [];

    for (const item of items) {
      if (seen.has(item.childId)) continue;
      seen.add(item.childId);
      next.push(item);
    }

    return next;
  };

  return {
    highAttentionChildren: takeUnique(board.highAttentionChildren),
    lowHydrationChildren: takeUnique(board.lowHydrationChildren),
    lowVegTrendChildren: takeUnique(board.lowVegTrendChildren),
  };
}

function getWeeklyReportRole(role: string): WeeklyReportRole {
  return role === "机构管理员" ? "admin" : "teacher";
}

function getInsightBadgeVariant(level: "success" | "warning" | "info") {
  if (level === "success") return "success";
  if (level === "warning") return "warning";
  return "info";
}

function DashboardQuickLink({
  href,
  eyebrow,
  title,
  description,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="dashboard-quicklink">
      <div className="space-y-2">
        <p className="dashboard-quicklink__eyebrow">{eyebrow}</p>
        <p className="dashboard-quicklink__title">{title}</p>
        <p className="dashboard-quicklink__description">{description}</p>
      </div>
      <div className="flex items-center justify-between text-sm font-medium text-slate-700">
        <span>打开入口</span>
        <ArrowRight className="dashboard-quicklink__icon h-4 w-4" />
      </div>
    </Link>
  );
}

function BoardList({
  title,
  items,
  emptyText,
  icon,
}: {
  title: string;
  items: string[];
  emptyText: string;
  icon: ReactNode;
}) {
  return (
    <div className="content-reading-panel rounded-3xl p-4 shadow-[var(--shadow-card)]">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm leading-6 text-slate-500">{emptyText}</p>
      ) : (
        <div className="space-y-2 text-sm leading-6 text-slate-600">
          {items.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RootOverviewPage() {
  const router = useRouter();
  const {
    authLoading,
    isAuthenticated,
    currentUser,
    visibleChildren,
    attendanceRecords,
    getTodayAttendance,
    getTodayMealRecords,
    getWeeklyDietTrend,
    getSmartInsights,
    getAdminBoardData,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    mealRecords,
  } = useApp();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && currentUser.role === "家长") {
      router.replace("/parent");
    }
  }, [authLoading, currentUser.role, isAuthenticated, router]);

  const visibleIds = useMemo(() => new Set(visibleChildren.map((child) => child.id)), [visibleChildren]);
  const todayAttendance = getTodayAttendance();
  const todayMeals = getTodayMealRecords();
  const weeklyTrend = getWeeklyDietTrend();
  const insights = getSmartInsights();
  const adminBoard = getAdminBoardData();
  const uniqueAdminBoard = useMemo(() => dedupeBoardExposure(adminBoard), [adminBoard]);
  const derivedRole = getWeeklyReportRole(currentUser.role);
  const weeklyReportCtaHref =
    derivedRole === "admin" ? "/admin/agent?action=weekly-report" : "/teacher/agent?action=weekly-report";
  const roleHomeHref = derivedRole === "admin" ? "/admin" : "/teacher/home";
  const presentCount = todayAttendance.filter((item) => item.isPresent).length;
  const pendingReviews = useMemo(
    () =>
      growthRecords
        .filter((record) => visibleIds.has(record.childId) && record.reviewStatus === "待复查")
        .sort((left, right) => (left.reviewDate ?? "9999-12-31").localeCompare(right.reviewDate ?? "9999-12-31")),
    [growthRecords, visibleIds]
  );

  const adminChartData = useMemo(() => {
    const merged = new Map<
      string,
      { childName: string; attentionRisk: number; hydrationRisk: number; vegetableRisk: number }
    >();

    adminBoard.highAttentionChildren.forEach((item) => {
      merged.set(item.childId, {
        childName: item.childName,
        attentionRisk: item.count,
        hydrationRisk: 0,
        vegetableRisk: 0,
      });
    });

    adminBoard.lowHydrationChildren.forEach((item) => {
      const next = merged.get(item.childId) ?? {
        childName: item.childName,
        attentionRisk: 0,
        hydrationRisk: 0,
        vegetableRisk: 0,
      };
      next.hydrationRisk = Math.max(0, 220 - item.hydrationAvg);
      merged.set(item.childId, next);
    });

    adminBoard.lowVegTrendChildren.forEach((item) => {
      const next = merged.get(item.childId) ?? {
        childName: item.childName,
        attentionRisk: 0,
        hydrationRisk: 0,
        vegetableRisk: 0,
      };
      next.vegetableRisk = Math.max(0, 7 - item.vegetableDays);
      merged.set(item.childId, next);
    });

    return Array.from(merged.values())
      .sort(
        (left, right) =>
          right.attentionRisk + right.hydrationRisk + right.vegetableRisk -
          (left.attentionRisk + left.hydrationRisk + left.vegetableRisk)
      )
      .slice(0, 5);
  }, [adminBoard]);

  const recentTimeline = useMemo(
    () =>
      [
        ...todayAttendance.map((item) => ({
          id: `attendance-${item.id}`,
          dateTime: `${item.date} ${item.checkInAt ?? (item.isPresent ? "08:30" : "09:00")}`,
          title: item.isPresent ? "完成出勤登记" : "记录缺勤原因",
          detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${
            item.isPresent ? `在园 ${item.checkInAt ?? "08:30"} 入园` : item.absenceReason ?? "未到园"
          }`,
        })),
        ...todayMeals.map((item) => ({
          id: `meal-${item.id}`,
          dateTime: `${item.date} ${item.meal}`,
          title: `完成${item.meal}录入`,
          detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${item.foods
            .map((food) => food.name)
            .join("、")}`,
        })),
        ...guardianFeedbacks
          .filter((item) => visibleIds.has(item.childId) && item.date === getLocalToday())
          .map((item) => ({
            id: `feedback-${item.id}`,
            dateTime: `${item.date} 20:00`,
            title: `收到家长反馈 · ${item.status}`,
            detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${item.content}`,
          })),
      ]
        .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
        .slice(0, 6),
    [guardianFeedbacks, todayAttendance, todayMeals, visibleChildren, visibleIds]
  );

  const weeklyReportSnapshot = useMemo(() => {
    const weekAttendance = attendanceRecords.filter(
      (record) => visibleIds.has(record.childId) && isRecentDate(record.date, 7)
    );
    const weekPresent = weekAttendance.filter((record) => record.isPresent).length;
    const weekMeals = mealRecords.filter((record) => visibleIds.has(record.childId) && isRecentDate(record.date, 7));
    const weekHealth = healthCheckRecords.filter(
      (record) => visibleIds.has(record.childId) && isRecentDate(record.date, 7)
    );
    const weekGrowth = growthRecords.filter(
      (record) => visibleIds.has(record.childId) && isRecentDate(record.createdAt.split(" ")[0], 7)
    );
    const weekFeedback = guardianFeedbacks.filter(
      (record) => visibleIds.has(record.childId) && isRecentDate(record.date, 7)
    );

    return {
      institutionName: INSTITUTION_NAME,
      periodLabel: `${formatRangeDate(6)} - ${formatRangeDate(0)}`,
      role: derivedRole,
      overview: {
        visibleChildren: visibleChildren.length,
        attendanceRate: weekAttendance.length > 0 ? Math.round((weekPresent / weekAttendance.length) * 100) : 0,
        mealRecordCount: weekMeals.length,
        healthAbnormalCount: weekHealth.filter((record) => record.isAbnormal).length,
        growthAttentionCount: weekGrowth.filter((record) => record.needsAttention).length,
        pendingReviewCount: weekGrowth.filter((record) => record.reviewStatus === "待复查").length,
        feedbackCount: weekFeedback.length,
      },
      diet: {
        balancedRate: weeklyTrend.balancedRate,
        hydrationAvg: weeklyTrend.hydrationAvg,
        monotonyDays: weeklyTrend.monotonyDays,
        vegetableDays: weeklyTrend.vegetableDays,
        proteinDays: weeklyTrend.proteinDays,
      },
      topAttentionChildren: adminBoard.highAttentionChildren.slice(0, 5).map((item) => ({
        childName: item.childName,
        attentionCount: item.count,
        hydrationAvg: adminBoard.lowHydrationChildren.find((entry) => entry.childId === item.childId)?.hydrationAvg ?? 0,
        vegetableDays: adminBoard.lowVegTrendChildren.find((entry) => entry.childId === item.childId)?.vegetableDays ?? 0,
      })),
      highlights: insights.filter((item) => item.level !== "warning").map((item) => item.title).slice(0, 4),
      risks: insights.filter((item) => item.level === "warning").map((item) => item.title).slice(0, 4),
    } satisfies WeeklyReportSnapshot;
  }, [
    adminBoard.highAttentionChildren,
    adminBoard.lowHydrationChildren,
    adminBoard.lowVegTrendChildren,
    attendanceRecords,
    derivedRole,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    insights,
    mealRecords,
    visibleChildren.length,
    visibleIds,
    weeklyTrend.balancedRate,
    weeklyTrend.hydrationAvg,
    weeklyTrend.monotonyDays,
    weeklyTrend.proteinDays,
    weeklyTrend.vegetableDays,
  ]);

  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportRefreshNonce, setWeeklyReportRefreshNonce] = useState(0);
  const weeklyReportKey = useMemo(
    () => `${JSON.stringify(weeklyReportSnapshot)}::${weeklyReportRefreshNonce}`,
    [weeklyReportRefreshNonce, weeklyReportSnapshot]
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const cached = weeklyReportCacheRef.current.get(weeklyReportKey);
    if (cached) {
      setWeeklyReport(cached);
      setWeeklyReportLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function fetchWeeklyReport() {
      setWeeklyReportLoading(true);
      try {
        const response = await fetch("/api/ai/weekly-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: weeklyReportSnapshot }),
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data = (await response.json()) as WeeklyReportResponse;
        if (!cancelled) {
          weeklyReportCacheRef.current.set(weeklyReportKey, data);
          setWeeklyReport(data);
        }
      } catch {
        if (!cancelled) {
          setWeeklyReport(null);
        }
      } finally {
        if (!cancelled) {
          setWeeklyReportLoading(false);
        }
      }
    }

    void fetchWeeklyReport();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated, weeklyReportKey, weeklyReportSnapshot]);

  const heroMetrics = [
    { label: "今日在园儿童", value: `${presentCount}`, tone: "sky" as const },
    { label: "今日餐食记录", value: `${todayMeals.length}`, tone: "emerald" as const },
    { label: "待复查事项", value: `${pendingReviews.length}`, tone: "amber" as const },
    { label: "AI 规则建议", value: `${insights.length}`, tone: "indigo" as const },
  ];

  const heroAside = (
    <div className="space-y-3">
      <div className="hero-note-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            {TODAY_TEXT}
          </Badge>
          <Badge variant="secondary">{currentUser.role}</Badge>
        </div>
        <p className="mt-4 text-base font-semibold text-slate-950">
          首屏集中承载今日身份、KPI、主操作与闭环状态，下层按周报、风险、建议逐级收束。
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          维持现有品牌色，只增强明暗层次、柔和发光和空间深度，保证评委录屏时第一屏就能读懂今天该看什么。
        </p>
      </div>
      <MetricGrid items={heroMetrics} className="sm:grid-cols-2" />
      <div className="grid gap-3 sm:grid-cols-3">
        <DashboardQuickLink
          href="/health"
          eyebrow="Morning Check"
          title="晨检与健康"
          description="批量登记体温、情绪与手口眼观察。"
        />
        <DashboardQuickLink
          href="/diet"
          eyebrow="Diet Loop"
          title="饮食与例外处理"
          description="批量录入餐食并处理过敏或个别调整。"
        />
        <DashboardQuickLink
          href="/parent"
          eyebrow="Family Loop"
          title="家长反馈"
          description="查看今晚反馈与家园协同节奏。"
        />
      </div>
    </div>
  );

  if (authLoading || !isAuthenticated || currentUser.role === "家长") {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-slate-500">正在加载平台首页…</p>
        </div>
      </div>
    );
  }

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="当前账号还没有可展示的首页数据。"
          description="请先使用示例账号，或为当前账号关联班级、儿童与基础记录。"
        />
      </div>
    );
  }

  return (
    <RolePageShell
      intensity="strong"
      badge={`全局总览 · ${INSTITUTION_NAME}`}
      title="高信息密度运营看板，收束成一个更适合路演和评审观看的沉浸式首页。"
      description="首屏只保留最重要的日期、身份、主叙事、主行动和 KPI。周报、风险图表与规则建议下沉到后两层，保持内容密度但不再是割裂的卡片墙。"
      actions={
        <>
          <InlineLinkButton href={roleHomeHref} label={derivedRole === "admin" ? "进入机构首页" : "进入教师首页"} variant="premium" />
          <InlineLinkButton href={weeklyReportCtaHref} label="进入完整 AI 周报" />
          <InlineLinkButton href="/health" label="开始今日闭环" />
        </>
      }
      heroAside={heroAside}
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.14fr)_minmax(300px,0.86fr)]">
          <WeeklyReportPreviewCard
            title="AI 周报总览"
            description="把近 7 天出勤、健康、饮食、成长与家长反馈压成一个首要阅读区，作为首页第一主内容。"
            role={derivedRole}
            periodLabel={weeklyReportSnapshot.periodLabel}
            report={weeklyReport}
            loading={weeklyReportLoading}
            ctaHref={weeklyReportCtaHref}
            ctaLabel="进入完整周报工作区"
            ctaVariant="premium"
            className="border-white/72"
          />

          <SectionCard
            title="今日驾驶舱摘要"
            description="首屏之外，只补充最需要被立即读懂的闭环信号与刷新动作。"
            surface="luminous"
            glow="brand"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl"
                onClick={() => {
                  weeklyReportCacheRef.current.delete(weeklyReportKey);
                  setWeeklyReport(null);
                  setWeeklyReportRefreshNonce((previous) => previous + 1);
                }}
                disabled={weeklyReportLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${weeklyReportLoading ? "animate-spin" : ""}`} />
                刷新周报
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="content-focus-block rounded-3xl p-4 shadow-[var(--shadow-card)]">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">本周出勤率</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{weeklyReportSnapshot.overview.attendanceRate}%</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    可见儿童 {weeklyReportSnapshot.overview.visibleChildren} 人，家园反馈 {weeklyReportSnapshot.overview.feedbackCount} 条。
                  </p>
                </div>
                <div className="content-reading-panel rounded-3xl p-4 shadow-[var(--shadow-card)]">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">风险收束</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{adminChartData.length}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    今日优先关注儿童 {uniqueAdminBoard.highAttentionChildren.length} 名，待复查事项 {pendingReviews.length} 条。
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {insights.slice(0, 3).map((insight) => (
                  <div
                    key={insight.id}
                    className="content-reading-panel rounded-3xl border border-white/75 p-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getInsightBadgeVariant(insight.level)}>{insight.level === "warning" ? "需关注" : insight.level === "success" ? "正向信号" : "今日建议"}</Badge>
                      {insight.tags.slice(0, 2).map((tag) => (
                        <Badge key={`${insight.id}-${tag}`} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{insight.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <SectionCard
            title="风险图表区"
            description="优先保证图表、数字与标签可读，在不改变主题色的前提下提高空间感与信号聚焦。"
            surface="glass"
            glow="soft"
          >
            <div className="space-y-5">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#dbe5f4" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="childName" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="attentionRisk" name="关注频次" fill="#fb7185" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="hydrationRisk" name="饮水缺口" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="vegetableRisk" name="蔬果缺口" fill="#34d399" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <BoardList
                  title="高频关注儿童"
                  icon={<Sparkles className="h-4 w-4 text-rose-500" />}
                  items={uniqueAdminBoard.highAttentionChildren.map((item) => `${item.childName} · ${item.count} 次`)}
                  emptyText="暂无高频关注儿童。"
                />
                <BoardList
                  title="饮水偏低提醒"
                  icon={<BookHeart className="h-4 w-4 text-sky-500" />}
                  items={uniqueAdminBoard.lowHydrationChildren.map((item) => `${item.childName} · ${item.hydrationAvg} ml`)}
                  emptyText="暂无饮水偏低提醒。"
                />
                <BoardList
                  title="蔬果摄入不足"
                  icon={<TriangleAlert className="h-4 w-4 text-emerald-500" />}
                  items={uniqueAdminBoard.lowVegTrendChildren.map((item) => `${item.childName} · ${item.vegetableDays} 天`)}
                  emptyText="暂无蔬果不足趋势。"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="规则建议区"
            description="保留高信息密度，但把建议块收口成可连续阅读的一列，而不是散乱卡片墙。"
            surface="solid"
            glow="soft"
          >
            <div className="space-y-3">
              {insights.slice(0, 6).map((insight) => (
                <div
                  key={insight.id}
                  className="content-reading-panel rounded-3xl border border-white/75 p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge variant={getInsightBadgeVariant(insight.level)}>
                      {insight.level === "warning" ? "风险提醒" : insight.level === "success" ? "正向变化" : "行动建议"}
                    </Badge>
                    <div className="flex flex-wrap gap-2">
                      {insight.tags.slice(0, 2).map((tag) => (
                        <Badge key={`${insight.id}-${tag}`} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{insight.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{insight.description}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard
            title="复查与重点追踪"
            description="第三层开始明显收束，只保留需要继续推进的事项。"
            surface="solid"
            glow="soft"
          >
            <div className="space-y-4">
              <div className="content-focus-block rounded-3xl p-4 shadow-[var(--shadow-card)]">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">待复查总量</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{pendingReviews.length}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  重点跟进成长记录与连续异常的闭环状态。
                </p>
              </div>
              <div className="space-y-3">
                {pendingReviews.slice(0, 4).map((record) => {
                  const child = visibleChildren.find((item) => item.id === record.childId);
                  return (
                    <div
                      key={record.id}
                      className="content-reading-panel rounded-3xl border border-white/75 p-4 shadow-[var(--shadow-card)]"
                    >
                      <p className="text-sm font-semibold text-slate-900">{child?.name ?? "幼儿"}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{record.followUpAction ?? record.description}</p>
                    </div>
                  );
                })}
                {pendingReviews.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-500">当前没有待复查事项。</p>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="模板入口"
            description="把批量录入模板下沉到更克制的一层，保留效率入口但不打断首屏叙事。"
            surface="solid"
            glow="soft"
          >
            <div className="space-y-3">
              {TEMPLATE_ENTRIES.map((template) => (
                <div
                  key={template.title}
                  className="content-reading-panel rounded-3xl border border-white/75 p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{template.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
                    </div>
                    <Link href="/diet">
                      <Button size="sm" variant="outline" className="rounded-xl">
                        使用
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.foods.map((food) => (
                      <Badge key={food} variant="secondary">
                        {food}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="今日时间线"
            description="保留一条连续的运营轨迹，便于录屏时讲清今天已经发生了什么。"
            surface="solid"
            glow="soft"
          >
            <div className="space-y-3">
              {recentTimeline.map((item) => (
                <div
                  key={item.id}
                  className="content-timeline-item rounded-3xl border border-white/75 p-4 shadow-[var(--shadow-card)]"
                >
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                  <p className="mt-2 text-xs text-slate-400">{item.dateTime}</p>
                </div>
              ))}
              {recentTimeline.length === 0 ? (
                <EmptyState
                  icon={<History className="h-6 w-6" />}
                  title="今日时间线尚未生成。"
                  description="当出勤、饮食或家长反馈开始产生后，这里会自动聚合成一条连续路径。"
                />
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </RolePageShell>
  );
}

function isRecentDate(dateString: string, days: number) {
  return isDateWithinLastDays(dateString, days);
}

function formatRangeDate(offsetDays: number) {
  const date = shiftLocalDate(getLocalToday(), -offsetDays);
  return new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}
