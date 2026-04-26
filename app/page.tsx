"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookHeart,
  CalendarDays,
  ClipboardList,
  History,
  TrendingDown,
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
import type { WeeklyReportResponse, WeeklyReportSnapshot } from "@/lib/ai/types";
import { getLocalToday, isDateWithinLastDays, shiftLocalDate } from "@/lib/date";
import type { AdminBoardData } from "@/lib/store";
import { INSTITUTION_NAME, useApp } from "@/lib/store";
import AnimatedNumber from "@/components/AnimatedNumber";
import EmptyState from "@/components/EmptyState";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const TEMPLATE_ENTRIES = [
  {
    title: "早餐批量模板",
    desc: "牛奶 + 鸡蛋 + 全麦主食，适合晨间快速录入。",
    foods: ["牛奶", "鸡蛋", "全麦面包"],
  },
  {
    title: "午餐均衡模板",
    desc: "主食 + 蛋白 + 蔬果，适合班级统一执行。",
    foods: ["米饭", "鸡肉", "西兰花"],
  },
  {
    title: "加餐轻量模板",
    desc: "水果 + 奶制品，便于处理加餐场景。",
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
  const presentCount = todayAttendance.filter((item) => item.isPresent).length;
  const todayMeals = getTodayMealRecords();
  const weeklyTrend = getWeeklyDietTrend();
  const insights = getSmartInsights();
  const adminBoard = getAdminBoardData();
  const uniqueAdminBoard = useMemo(() => dedupeBoardExposure(adminBoard), [adminBoard]);
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
  const pendingReviews = growthRecords
    .filter((record) => visibleIds.has(record.childId) && record.reviewStatus === "待复查")
    .sort((left, right) => (left.reviewDate ?? "9999-12-31").localeCompare(right.reviewDate ?? "9999-12-31"));

  const recentTimeline = [
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
        title: `收到家长反馈：${item.status}`,
        detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${item.content}`,
      })),
  ]
    .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
    .slice(0, 6);

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
      role: currentUser.role,
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
    currentUser.role,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    insights,
    mealRecords,
    visibleChildren,
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

    fetchWeeklyReport();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated, weeklyReportKey, weeklyReportSnapshot]);

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
          title="当前账号还没有可展示的首页数据"
          description="请先使用示例账号，或为当前账号关联班级、儿童与基础记录。"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-indigo-100 bg-linear-to-r from-indigo-50 via-sky-50 to-white p-7 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="info" className="px-3 py-1 text-xs">
              <CalendarDays className="mr-1 h-3.5 w-3.5" />
              {TODAY_TEXT}
            </Badge>
            <Badge variant="secondary" className="px-3 py-1 text-xs">
              当前身份：{currentUser.role}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">普惠托育智慧闭环看板</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            已将功能升级为业务闭环：出勤 → 批量录入餐食 → 个别调整 → 成长观察 → 家长反馈，并以规则引擎输出可解释建议。
          </p>
          <p className="mt-3 text-xs text-slate-500">平台默认内置近七天评审示例数据，首次进入即可直接预览全链路效果。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink href="/health" title="晨检与健康" description="记录每日体温、情绪、手口眼" />
          <QuickLink href="/diet" title="批量录入与例外处理" description="支持过敏拦截、手动排除、单个调整" />
          <QuickLink href="/parent" title="家长反馈时间线" description="已知晓 / 在家已配合 / 今晚反馈" />
        </div>
      </div>

      <ScrollReveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="可见幼儿" value={`${visibleChildren.length}`} desc={`${currentUser.role}权限范围`} />
          <StatCard title="今日出勤" value={`${presentCount}`} desc={visibleChildren.length ? `出勤率 ${Math.round((presentCount / visibleChildren.length) * 100)}%` : "暂无数据"} />
          <StatCard title="今日饮食记录" value={`${todayMeals.length}`} desc="含早餐/午餐/晚餐/加餐" />
          <StatCard title="规则建议" value={`${insights.length}`} desc="按年龄段、过敏、连续异常生成" />
        </div>
      </ScrollReveal>

      <Card className="mt-6 border-indigo-100 bg-linear-to-r from-indigo-50/80 via-white to-sky-50/70">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              AI 智能周报
              {weeklyReport?.source === "ai" ? <Badge variant="success">AI</Badge> : null}
              {weeklyReport?.source === "fallback" ? <Badge variant="info">规则兜底</Badge> : null}
            </CardTitle>
            <CardDescription>聚合近 7 天出勤、健康、饮食、成长与家园反馈数据，用于答辩展示和运营复盘。</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              weeklyReportCacheRef.current.delete(weeklyReportKey);
              setWeeklyReport(null);
              setWeeklyReportRefreshNonce((prev) => prev + 1);
            }}
            disabled={weeklyReportLoading}
          >
            {weeklyReportLoading ? "生成中..." : "刷新周报"}
          </Button>
        </CardHeader>
        <CardContent>
          {weeklyReport ? (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">周期：{weeklyReportSnapshot.periodLabel}</Badge>
                  <Badge variant="secondary">预测：{getTrendPredictionLabel(weeklyReport.trendPrediction)}</Badge>
                  {weeklyReport.model ? <Badge variant="secondary">模型：{weeklyReport.model}</Badge> : null}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">{weeklyReport.summary}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <WeeklyReportPanel title="本周亮点" items={weeklyReport.highlights} tone="emerald" />
                  <WeeklyReportPanel title="主要风险" items={weeklyReport.risks} tone="rose" />
                  <WeeklyReportPanel title="下周动作" items={weeklyReport.nextWeekActions} tone="indigo" />
                </div>
              </div>
              <div className="grid gap-3">
                <MetricCard label="本周出勤率" value={`${weeklyReportSnapshot.overview.attendanceRate}%`} />
                <MetricCard label="健康异常记录" value={`${weeklyReportSnapshot.overview.healthAbnormalCount}次`} />
                <MetricCard label="待复查事项" value={`${weeklyReportSnapshot.overview.pendingReviewCount}项`} />
                <MetricCard label="家园反馈数" value={`${weeklyReportSnapshot.overview.feedbackCount}条`} />
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
              {weeklyReportLoading ? "正在生成 AI 周报…" : "AI 周报暂不可用，请稍后重试。"}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookHeart className="h-5 w-5 text-rose-500" />
              管理员风险对比图
            </CardTitle>
            <CardDescription>柱越高代表风险越需要优先关注，统一对比高关注、低饮水和蔬果不足。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-65 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="childName" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="attentionRisk" name="关注频次" fill="#fb7185" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="hydrationRisk" name="饮水缺口" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="vegetableRisk" name="蔬果缺口" fill="#34d399" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <BoardList
                title="高频关注儿童"
                icon={<AlertIcon />}
                items={uniqueAdminBoard.highAttentionChildren.map((item) => `${item.childName}（${item.count}次）`)}
                emptyText="暂无"
              />
              <BoardList
                title="低饮水提醒"
                icon={<TrendingDown className="h-4 w-4 text-sky-400" />}
                items={uniqueAdminBoard.lowHydrationChildren.map((item) => `${item.childName}（${item.hydrationAvg}ml）`)}
                emptyText="暂无"
              />
              <BoardList
                title="蔬果不足趋势"
                icon={<TrendingDown className="h-4 w-4 text-emerald-400" />}
                items={uniqueAdminBoard.lowVegTrendChildren.map((item) => `${item.childName}（${item.vegetableDays}天）`)}
                emptyText="暂无"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>规则建议（Top）</CardTitle>
            <CardDescription>可直接用于答辩说明“为什么给出该建议”。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.slice(0, 6).map((insight) => (
              <div key={insight.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant={insight.level === "success" ? "success" : insight.level === "warning" ? "warning" : "info"}>
                    {insight.level === "success" ? "已就绪" : insight.level === "warning" ? "需关注" : "建议"}
                  </Badge>
                  <div className="flex flex-wrap justify-end gap-1">
                    {insight.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-700">{insight.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{insight.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="hidden mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>业务闭环流程</CardTitle>
            <CardDescription>比赛演示可按此顺序操作，逻辑完整且可解释。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["1", "出勤", `${presentCount} 人出勤，进入今日闭环起点`, "/children"],
              ["2", "健康晨检", "支持批量出勤幼儿进行健康状况快速录入", "/health"],
              ["3", "批量录餐", "按出勤名单一键录入，并支持过敏拦截", "/diet"],
              ["4", "成长观察", "记录行为、情绪、睡眠并标记复查", "/growth"],
              ["5", "家长反馈", "已知晓 / 在家已配合 / 今晚反馈", "/parent"],
            ].map(([icon, title, desc, href]) => (
              <Link key={title} href={href} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                <p className="text-lg font-bold text-indigo-500">{icon}</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-indigo-500" />
              今日运营时间线
            </CardTitle>
            <CardDescription>把出勤、录餐、反馈串成一条可讲清楚的业务路径。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTimeline.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                <p className="mt-2 text-[11px] text-slate-400">{item.dateTime}</p>
              </div>
            ))}
            {recentTimeline.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title="今日时间线尚未生成"
                description="当出勤、饮食或家长反馈开始产生后，这里会自动聚合为运营时间线。"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              复查状态
            </CardTitle>
            <CardDescription>聚焦待复查事项，便于教师和机构管理员安排追踪。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs text-amber-600">待复查事项</p>
              <p className="mt-2 text-3xl font-bold text-amber-700">
                <AnimatedNumber value={pendingReviews.length} />
              </p>
            </div>
            {pendingReviews.slice(0, 4).map((record) => {
              const child = visibleChildren.find((item) => item.id === record.childId);
              return (
                <div key={record.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700">{child?.name ?? "幼儿"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{record.followUpAction ?? record.description}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-emerald-500" />
              批量模板入口
            </CardTitle>
            <CardDescription>用于演示模板化录入、例外处理和过敏拦截。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {TEMPLATE_ENTRIES.map((template) => (
              <div key={template.title} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">{template.title}</p>
                  <Link href="/diet">
                    <Button size="sm" variant="outline">去使用</Button>
                  </Link>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{template.desc}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {template.foods.map((food) => (
                    <span key={food} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
                      {food}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-indigo-500" />
              今日运营时间线
            </CardTitle>
            <CardDescription>把出勤、录餐、反馈串成一条可讲清楚的业务路径。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTimeline.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                <p className="mt-2 text-[11px] text-slate-400">{item.dateTime}</p>
              </div>
            ))}
            {recentTimeline.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title="今日时间线尚未生成"
                description="当出勤、饮食或家长反馈开始产生后，这里会自动聚合为运营时间线。"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-indigo-500" />
      </div>
    </Link>
  );
}

function StatCard({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
    <Card className="kpi-accent card-hover border-l-4 border-l-indigo-300">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold text-slate-800">
          <AnimatedNumber value={Number(value)} />
        </p>
        <p className="mt-2 text-xs text-slate-500">{desc}</p>
      </CardContent>
    </Card>
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
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="py-2 text-center text-xs italic text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-1.5 text-xs text-slate-600">
          {items.map((text) => (
            <p key={text}>• {text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertIcon() {
  return <Sparkles className="h-4 w-4 text-rose-400" />;
}

function WeeklyReportPanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "indigo";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="text-sm leading-6 text-slate-600">
            {index + 1}. {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  const suffix = value.replace(/[\d.-]/g, "");
  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-800">
        {Number.isNaN(parsed) ? value : <AnimatedNumber value={parsed} suffix={suffix} />}
      </p>
    </div>
  );
}

function getTrendPredictionLabel(value: "up" | "stable" | "down") {
  if (value === "up") return "风险上升";
  if (value === "down") return "风险下降";
  return "基本稳定";
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
