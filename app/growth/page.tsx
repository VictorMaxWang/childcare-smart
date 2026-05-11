"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookHeart,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  HeartPulse,
  MessageSquareText,
  PlusCircle,
  ShieldAlert,
  Utensils,
  Workflow,
} from "lucide-react";
import {
  BEHAVIOR_CATEGORIES,
  type AgeBand,
  getAgeBandFromBirthDate,
  getAgeText,
  type BehaviorCategory,
  useApp,
} from "../../lib/store";
import {
  ReplicaBarChart,
  ReplicaDonutChart,
  ReplicaLineChart,
  replicaChartColors,
  type ReplicaChartDatum,
  type ReplicaDonutDatum,
} from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import EmptyState from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";  
import { TeacherActionTile, TeacherContextStrip, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import { useParentD01Data } from "@/components/parent/useParentD01Data";
import { buildRecentLocalDateRange, normalizeLocalDate } from "@/lib/date";
import { DEMO_MEDIA_FALLBACKS } from "@/lib/demo-media/assets";
import { OBSERVATION_INDICATOR_MAP, type ObservationIndicatorOption } from "@/lib/mock/observation";
import { toast } from "sonner";

export default function GrowthPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child");
  const parentD01 = useParentD01Data(childFromQuery);
  const { currentUser, visibleChildren, growthRecords, addGrowthRecord } = useApp();
  const [selectedChildId, setSelectedChildId] = useState<string>(visibleChildren[0]?.id ?? "");
  const [category, setCategory] = useState<BehaviorCategory>("情绪表现");
  const [tags, setTags] = useState("午睡前, 课堂观察");
  const [description, setDescription] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
  const [filterValue, setFilterValue] = useState("全部");
  const [reviewFilter, setReviewFilter] = useState("全部");
  const [followUpAction, setFollowUpAction] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [showFormOnMobile, setShowFormOnMobile] = useState(false);
  const [parentDetailRecordId, setParentDetailRecordId] = useState<string | null>(null);

  const isTeacher = currentUser.role === "教师";
  const isParent = currentUser.role === "家长";

  useEffect(() => {
    if (!isParent || !parentD01.selectedChildId || parentD01.invalidChildId || childFromQuery === parentD01.selectedChildId) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("child", parentD01.selectedChildId);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [
    childFromQuery,
    isParent,
    parentD01.invalidChildId,
    parentD01.selectedChildId,
    pathname,
    router,
    searchParams,
  ]);
  const visibleIds = visibleChildren.map((child) => child.id);
  const filteredRecords = useMemo(() => {
    return growthRecords.filter((record) => {
      const withinScope = visibleIds.includes(record.childId);
      const categoryMatched = filterValue === "全部" || record.category === filterValue;
      const reviewMatched = reviewFilter === "全部" || (record.reviewStatus ?? "已完成") === reviewFilter;
      return withinScope && categoryMatched && reviewMatched;
    });
  }, [filterValue, growthRecords, reviewFilter, visibleIds]);

  const pendingRecords = useMemo(
    () => filteredRecords.filter((record) => record.reviewStatus === "待复查"),
    [filteredRecords]
  );

  const completedRecords = useMemo(
    () => filteredRecords.filter((record) => record.reviewStatus === "已完成"),
    [filteredRecords]
  );

  const availableIndicators = useMemo(() => {
    if (!selectedChildId) return [];
    const child = visibleChildren.find(c => c.id === selectedChildId);
    if (!child) return [];
    const ageBand = getAgeBandFromBirthDate(child.birthDate);
    const indicatorsByCategory = OBSERVATION_INDICATOR_MAP as Partial<
      Record<BehaviorCategory, Partial<Record<AgeBand, ObservationIndicatorOption[]>>>
    >;
    return indicatorsByCategory[category]?.[ageBand] ?? [];
  }, [selectedChildId, category, visibleChildren]);

  // Helper to resolve indicator labels
  const getIndicatorLabel = (indicatorId: string) => {
    const indicatorsByCategory = OBSERVATION_INDICATOR_MAP as Partial<
      Record<BehaviorCategory, Partial<Record<AgeBand, ObservationIndicatorOption[]>>>
    >;
    for (const cat in OBSERVATION_INDICATOR_MAP) {
      const ageBands = indicatorsByCategory[cat as BehaviorCategory];
      if (!ageBands) continue;
      for (const band in ageBands) {
        const indicators = ageBands[band as AgeBand];
        if (!indicators) continue;
        const found = indicators.find((ind) => ind.id === indicatorId);
        if (found) return found.label;
      }
    }
    return indicatorId;
  };

  const timelineRecords = useMemo(
    () => [...filteredRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filteredRecords]
  );

  const categoryChartData = useMemo(() => {
    const counter = new Map<string, number>();
    filteredRecords.forEach((record) => {
      counter.set(record.category, (counter.get(record.category) ?? 0) + 1);
    });

    return Array.from(counter.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRecords]);

  const trendKeys = useMemo(
    () => categoryChartData.slice(0, 3).map((item) => item.name),
    [categoryChartData]
  );

  const categoryTrendData = useMemo(() => {
    return buildRecentDateRange(7).map((date) => {
      const row: Record<string, string | number> = {
        label: formatShortDate(date),
      };

      trendKeys.forEach((key) => {
        row[key] = filteredRecords.filter((record) => record.category === key && normalizeRecordDate(record.createdAt) === date).length;
      });

      return row;
    });
  }, [filteredRecords, trendKeys]);

  const reviewChartData = useMemo(
    () => [
      { name: "待复查", value: pendingRecords.length, fill: "#f59e0b" },
      { name: "已完成", value: completedRecords.length, fill: "#10b981" },
    ],
    [completedRecords.length, pendingRecords.length]
  );
  const categoryTrendRows = useMemo<ReplicaChartDatum[]>(
    () => categoryTrendData.map((item) => ({ ...item, label: String(item.label) })),
    [categoryTrendData]
  );
  const categoryDistributionRows = useMemo<ReplicaDonutDatum[]>(
    () =>
      categoryChartData.map((item, index) => ({
        label: item.name,
        value: item.value,
        color: GROWTH_CHART_COLORS[index % GROWTH_CHART_COLORS.length],
      })),
    [categoryChartData]
  );
  const reviewStatusRows = useMemo<ReplicaChartDatum[]>(
    () => reviewChartData.map((item) => ({ label: item.name, count: item.value })),
    [reviewChartData]
  );

  function submitRecord() {
    if (!selectedChildId || !description.trim()) {
      toast.warning("请先补充观察描述。", {
        description: "成长记录至少需要明确对象和具体观察内容。",
      });
      return;
    }

    const childName = visibleChildren.find((child) => child.id === selectedChildId)?.name ?? "该幼儿";
    const saveResult = addGrowthRecord({
      childId: selectedChildId,
      category,
      tags: tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      description: description.trim(),
      needsAttention,
      followUpAction: followUpAction.trim() || undefined,
      reviewDate: reviewDate || undefined,
      selectedIndicators: selectedIndicators.length > 0 ? selectedIndicators : undefined,
    });
    if (saveResult.status === "failed") {
      toast.error("成长记录保存失败", {
        description: saveResult.message,
      });
      return;
    }

    toast.success("成长记录已保存", {
      description: `${childName} 的${category}观察已加入台账。${
        saveResult.status === "local_only" ? "已写入共享演示数据，刷新后保留。" : "已写入当前数据层，刷新后保留。"
      }`,
    });
    setDescription("");
    setTags("");
    setNeedsAttention(false);
    setFollowUpAction("");
    setReviewDate("");
    setSelectedIndicators([]);
  }

  if (isParent) {
    const parentChild = parentD01.selectedChild;
    const parentGrowthRecords = (parentD01.parentHomeData?.dailyRecords ?? [])
      .filter((record) => record.type === "growth")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const parentDetailRecord =
      parentGrowthRecords.find((record) => record.recordId === parentDetailRecordId) ?? parentGrowthRecords[0] ?? null;
    const parentDetailPayload = parentDetailRecord?.payload ?? null;
    const parentDetailMediaSources = getGrowthMediaSources(parentDetailPayload);

    if (parentD01.invalidChildId) {
      return (
        <div className="app-page flex min-h-[70vh] items-center justify-center page-enter">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="无法查看该孩子的成长档案"
            description="当前家长账号没有该 childId 的授权，系统不会自动回退到其他孩子。"
          />
        </div>
      );
    }

    if (!parentChild || !parentD01.parentHomeData) {
      return (
        <div className="app-page flex min-h-[70vh] items-center justify-center page-enter">
          <EmptyState
            icon={<BookHeart className="h-6 w-6" />}
            title="暂无可查看的成长档案"
            description="当前账号还没有关联孩子，或 D01 store 中没有可见的成长记录。"
          />
        </div>
      );
    }

    return (
      <div className="app-page max-w-[76rem] page-enter">
        <section className="mb-5 overflow-hidden rounded-2xl border border-rose-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_48%,#eef2ff_100%)] p-4 shadow-[0_20px_58px_rgb(244_63_94_/_0.10)] sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="rounded-full px-3 py-1">
                  {parentChild.name}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {parentChild.className}
                </Badge>
                <Badge variant={parentGrowthRecords.length > 0 ? "success" : "outline"} className="rounded-full px-3 py-1">
                  D01 成长记录 {parentGrowthRecords.length} 条
                </Badge>
              </div>
              <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                <BookHeart className="h-7 w-7 text-rose-500" />
                成长档案
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                这里展示老师在成长记录中写入的真实档案数据，刷新后仍来自 D01 store，不插入静态示例。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => router.push(`/parent/storybook?child=${parentChild.id}`)}
            >
              生成成长绘本
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="成长记录" value={`${parentGrowthRecords.length} 条`} icon={<BookHeart className="h-5 w-5" />} tone="primary" />
            <MetricCard
              label="需关注"
              value={`${parentGrowthRecords.filter((record) => Boolean(record.payload.needsAttention)).length} 条`}
              icon={<CalendarClock className="h-5 w-5" />}
              tone="warning"
            />
            <MetricCard
              label="最近更新"
              value={parentGrowthRecords[0]?.createdAt ? formatShortDate(parentGrowthRecords[0].createdAt) : "暂无"}
              icon={<Clock3 className="h-5 w-5" />}
              tone="success"
            />
          </div>
        </section>

        {parentGrowthRecords.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="py-12">
              <EmptyState
                icon={<Workflow className="h-6 w-6" />}
                title="暂无成长记录"
                description="D01 store 中当前 childId 还没有成长档案记录。"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">成长记录列表</CardTitle>
                <CardDescription>按写入时间倒序展示，只显示当前 childId 的记录。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {parentGrowthRecords.map((record) => {
                  const payload = record.payload;
                  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : [];
                  const category = typeof payload.category === "string" ? payload.category : "成长记录";
                  const description = typeof payload.description === "string" ? payload.description : "暂无详细描述";
                  return (
                    <article
                      key={record.recordId}
                      data-testid="growth-record-card"
                      data-child-id={record.childId}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">{category}</Badge>
                            {payload.needsAttention ? <Badge variant="warning">需关注</Badge> : <Badge variant="success">已记录</Badge>}
                            <Badge variant="secondary">{record.createdAt}</Badge>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{description}</p>
                          <GrowthRecordMediaStrip
                            sources={getGrowthMediaSources(payload)}
                            alt={`${parentChild.name} ${category} 成长影像`}
                            recordId={record.recordId}
                            childId={record.childId}
                          />
                          {tags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <span key={`${record.recordId}-${tag}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setParentDetailRecordId(record.recordId)}>
                          <Eye className="mr-2 h-4 w-4" />
                          查看详情
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">记录详情</CardTitle>
                <CardDescription>{parentDetailRecord ? `记录 ID：${parentDetailRecord.recordId}` : "选择一条记录查看详情"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {parentDetailRecord && parentDetailPayload ? (
                  <>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">记录时间</p>
                      <p className="mt-1 font-semibold text-slate-900">{parentDetailRecord.createdAt}</p>
                      <p className="mt-2 text-xs text-slate-500">记录人</p>
                      <p className="mt-1 text-slate-700">{parentDetailRecord.createdBy}</p>
                    </div>
                    <div className="rounded-2xl bg-rose-50/70 p-4">
                      <p className="text-xs text-rose-500">描述</p>
                      <p className="mt-2 leading-6 text-slate-700">
                        {typeof parentDetailPayload.description === "string" ? parentDetailPayload.description : "暂无详细描述"}
                      </p>
                      <GrowthRecordMediaStrip
                        sources={parentDetailMediaSources}
                        alt={`${parentChild.name} 成长记录详情影像`}
                        recordId={parentDetailRecord.recordId}
                        childId={parentDetailRecord.childId}
                        compact
                      />
                    </div>
                    {Array.isArray(parentDetailPayload.selectedIndicators) && parentDetailPayload.selectedIndicators.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-slate-500">结构化指标</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {parentDetailPayload.selectedIndicators
                            .filter((indicator): indicator is string => typeof indicator === "string")
                            .map((indicator) => (
                              <Badge key={`${parentDetailRecord.recordId}-${indicator}`} variant="outline">
                                {getIndicatorLabel(indicator)}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-3 rounded-2xl border border-slate-100 p-4">
                      <p>跟进行动：{typeof parentDetailPayload.followUpAction === "string" ? parentDetailPayload.followUpAction : "暂无"}</p>
                      <p>复查日期：{typeof parentDetailPayload.reviewDate === "string" ? parentDetailPayload.reviewDate : "暂无"}</p>
                      <p>复查状态：{typeof parentDetailPayload.reviewStatus === "string" ? parentDetailPayload.reviewStatus : "暂无"}</p>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={<Eye className="h-6 w-6" />}
                    title="请选择成长记录"
                    description="左侧选择一条记录后查看详情。"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-page max-w-[86rem] page-enter" data-testid="r05-growth-page">
      {isTeacher ? (
        <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#fff1f2_100%)] p-4 shadow-[0_22px_64px_rgb(99_102_241_/_0.12)] sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="rounded-full px-3 py-1">{currentUser.className ?? "当前班级"}</Badge>
                <Badge variant={pendingRecords.length > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">待复查 {pendingRecords.length} 条</Badge>
              </div>
              <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                <BookHeart className="h-7 w-7 text-indigo-500" />
                成长与行为记录
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                按时间线记录孩子的成长点滴与行为表现，科学观察，用心陪伴。
              </p>
            </div>
            <Button type="button" variant="premium" className="min-h-11 rounded-2xl" onClick={() => setShowFormOnMobile((prev) => !prev)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              新增记录
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "今日记录", value: `${timelineRecords.filter((record) => normalizeLocalDate(record.createdAt) === normalizeLocalDate(new Date().toISOString())).length}条`, icon: Clock3, tone: "bg-indigo-50 text-indigo-700" },
              { label: "记录幼儿", value: `${new Set(timelineRecords.map((record) => record.childId)).size}名`, icon: Workflow, tone: "bg-sky-50 text-sky-700" },
              { label: "图文记录", value: `${timelineRecords.length}条`, icon: BookHeart, tone: "bg-rose-50 text-rose-700" },
              { label: "观察标签", value: `${categoryChartData.reduce((sum, item) => sum + item.value, 0)}次`, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-white/82 bg-white/88 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-950 sm:text-3xl">{item.value}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {["全部记录", "行为观察", "语言表达", "社交互动", "精细动作", "情绪发展"].map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${index === 0 || filterValue === item ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-50 text-slate-600 ring-1 ring-slate-100"}`}
                    onClick={() => setFilterValue(index === 0 ? "全部" : item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setShowFormOnMobile((prev) => !prev)}>
                更多筛选
              </Button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                {timelineRecords.slice(0, 4).map((record) => {
                  const child = visibleChildren.find((item) => item.id === record.childId);
                  return (
                    <article
                      key={`teacher-growth-feature-${record.id}`}
                      data-testid="growth-record-card"
                      data-child-id={record.childId}
                      className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 md:grid-cols-[76px_1fr_190px] md:items-center"
                    >
                      <div className="text-sm text-slate-500">
                        <p className="font-semibold text-slate-950">{formatShortDate(record.createdAt)}</p>
                        <p className="mt-1">{new Date(record.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-sm">{child?.gender === "男" ? "👦" : "👧"}</span>
                          <p className="font-semibold text-slate-950">{child?.name ?? "未识别幼儿"}</p>
                          <Badge variant="info" className="rounded-full px-3 py-1">{record.category}</Badge>
                          {record.needsAttention ? <Badge variant="warning" className="rounded-full px-3 py-1">需关注</Badge> : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{record.description}</p>
                        <GrowthRecordMediaStrip
                          sources={getGrowthMediaSources(record)}
                          alt={`${child?.name ?? "幼儿"} ${record.category} 成长影像`}
                          recordId={record.id}
                          childId={record.childId}
                          compact
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="rounded-full px-3 py-1">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">
                        <p className="font-semibold text-slate-950">{record.reviewStatus ?? "已完成"}</p>
                        <p className="mt-2 line-clamp-3">{record.followUpAction ?? "继续观察并记录变化。"}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-950">记录数据概览</p>
                  <div className="mt-4 space-y-3">
                    {categoryChartData.slice(0, 5).map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <span className="text-slate-600">{item.name}</span>
                        <strong className="text-slate-950">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="text-sm font-semibold text-indigo-900">移动端节奏</p>
                  <p className="mt-2 text-sm leading-6 text-indigo-800">
                    先筛选维度，再看图文观察卡，必要时展开新增记录表单补录。
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      ) : (
      <section className="mb-5 overflow-hidden rounded-2xl border border-rose-100 bg-[linear-gradient(135deg,#fff1f2_0%,#f8fbff_48%,#eef2ff_100%)] p-4 shadow-[0_20px_60px_rgb(244_63_94_/_0.10)] sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="rounded-full px-3 py-1">
                    {isTeacher ? currentUser.className ?? "当前班级" : "成长行为"}
                  </Badge>
                  <Badge variant={pendingRecords.length > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">
                    待复查 {pendingRecords.length} 条
                  </Badge>
                </div>
                <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  <BookHeart className="h-7 w-7 text-rose-500" />
                  成长记录与复查看板
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  先看观察维度、复查压力和近期时间线，再展开表单补充新的成长行为记录。
                </p>
              </div>
              <Button type="button" variant="premium" className="min-h-11 rounded-2xl" onClick={() => setShowFormOnMobile((prev) => !prev)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                新增观察
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "观察记录", value: `${filteredRecords.length}条`, icon: BookHeart, tone: "bg-rose-50 text-rose-700" },
                { label: "待复查", value: `${pendingRecords.length}条`, icon: CalendarClock, tone: "bg-amber-50 text-amber-700" },
                { label: "已完成", value: `${completedRecords.length}条`, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
                { label: "观察维度", value: `${categoryChartData.length}类`, icon: Workflow, tone: "bg-indigo-50 text-indigo-700" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-white/82 bg-white/84 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold leading-tight text-slate-950">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/82 bg-white/78 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">近期关注</p>
            <div className="mt-4 space-y-3">
              {timelineRecords.slice(0, 3).map((record) => {
                const child = visibleChildren.find((item) => item.id === record.childId);
                return (
                  <div key={`growth-focus-${record.id}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-950">{child?.name ?? "未识别幼儿"}</span>
                      <Badge variant={record.reviewStatus === "待复查" ? "warning" : "secondary"}>{record.reviewStatus ?? "已完成"}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{record.description}</p>
                  </div>
                );
              })}
              {timelineRecords.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">当前筛选下暂无成长记录。</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-3 xl:sticky xl:top-24 xl:h-fit">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between rounded-2xl xl:hidden"
            onClick={() => setShowFormOnMobile((prev) => !prev)}
          >
            <span className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              {showFormOnMobile ? "收起新增记录" : "展开新增记录"}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showFormOnMobile ? "rotate-180" : ""}`} />
          </Button>

        <Card className={`h-fit overflow-hidden rounded-2xl border-indigo-100 shadow-sm ${showFormOnMobile ? "block" : "hidden xl:block"}`}>
          <CardHeader>
            <CardTitle className="text-lg">新增观察记录</CardTitle>
            <CardDescription>家长和教师均可补充观察，机构管理员可做复盘。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="记录对象" htmlFor="growth-child" required>
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger id="growth-child">
                  <SelectValue placeholder="选择幼儿" />
                </SelectTrigger>
                <SelectContent>
                  {visibleChildren.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.name} · {child.className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="观察维度" htmlFor="growth-category" required>
              <Select value={category} onValueChange={(value) => setCategory(value as BehaviorCategory)}>
                <SelectTrigger id="growth-category">
                  <SelectValue placeholder="选择维度" />
                </SelectTrigger>
                <SelectContent>
                  {BEHAVIOR_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            
            {availableIndicators.length > 0 && (
              <fieldset className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <legend className="text-sm font-medium text-indigo-700">结构化观察指标</legend>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {availableIndicators.map((indicator) => {
                    const isSelected = selectedIndicators.includes(indicator.id);
                    return (
                      <label
                        key={indicator.id} 
                        htmlFor={`indicator-${indicator.id}`}
                        className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${isSelected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-100'}`}
                      >
                        <input
                          id={`indicator-${indicator.id}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedIndicators((prev) =>
                              isSelected ? prev.filter((id) => id !== indicator.id) : [...prev, indicator.id]
                            );
                          }}
                          className="sr-only"
                        />
                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300'}`} aria-hidden="true">
                          {isSelected ? <CheckCircle2 className="h-3 w-3" /> : null}
                        </div>
                        <span className={`text-sm ${isSelected ? 'text-indigo-900 font-medium' : 'text-slate-600'}`}>
                          {indicator.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <FormField label="观察标签" htmlFor="growth-tags" description="用逗号分隔多个标签。">
              <Input id="growth-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="如：午睡前, 自主进食" />
            </FormField>
            <FormField label="描述" htmlFor="growth-description" required>
              <Textarea
                id="growth-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="请记录具体表现、触发场景和处理方式。"
              />
            </FormField>
            <FormField label="跟进行动" htmlFor="growth-follow-up">
              <Input
                id="growth-follow-up"
                value={followUpAction}
                onChange={(event) => setFollowUpAction(event.target.value)}
                placeholder="如：午睡前增加绘本安抚、明早复查入园情绪"
              />
            </FormField>
            <FormField label="复查日期" htmlFor="growth-review-date">
              <Input id="growth-review-date" type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium text-slate-700">是否需要关注</p>
                <p className="text-xs text-slate-400">用于触发后续提醒和家园协同任务。</p>
              </div>
              <Button variant={needsAttention ? "destructive" : "outline"} aria-pressed={needsAttention} onClick={() => setNeedsAttention((prev) => !prev)}>
                {needsAttention ? "需要关注" : "正常观察"}
              </Button>
            </div>
            <Button className="w-full gap-2" onClick={submitRecord} data-testid="r05-growth-save-record">
              <PlusCircle className="h-4 w-4" />
              保存记录
            </Button>
          </CardContent>
        </Card>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard label="待复查" value={`${pendingRecords.length}条`} icon={<CalendarClock className="h-5 w-5" />} tone="warning" />
            <MetricCard label="已完成复查" value={`${completedRecords.length}条`} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
            <MetricCard label="当前身份" value={currentUser.role} tone="primary" />
          </div>

          {isTeacher ? (
            <div className="space-y-4">
              <TeacherContextStrip
                items={[
                  { label: "可见幼儿", value: `${visibleChildren.length}人`, tone: "indigo" },
                  { label: "今日待复查", value: `${pendingRecords.length}条`, tone: pendingRecords.length > 0 ? "amber" : "emerald" },
                  { label: "当前观察维度", value: filterValue === "全部" ? "全部维度" : filterValue, tone: "sky" },
                  { label: "新增入口", value: showFormOnMobile ? "已展开" : "左侧固定", tone: "rose" },
                ]}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <TeacherActionTile
                  href="/health"
                  icon={<HeartPulse className="h-5 w-5" />}
                  title="回看晨检"
                  description="先确认今天的异常和复查状态。"
                  tone="rose"
                />
                <TeacherActionTile
                  href="/diet"
                  icon={<Utensils className="h-5 w-5" />}
                  title="补充饮食"
                  description="把进餐、饮水和过敏反馈补齐。"
                  tone="emerald"
                />
                <TeacherActionTile
                  href="/teacher/agent?action=communication"
                  icon={<MessageSquareText className="h-5 w-5" />}
                  title="生成沟通建议"
                  description="把观察记录整理成家园沟通话术。"
                  tone="indigo"
                  highlight
                />
              </div>
              <TeacherMiniPanel
                title="教师扫读重点"
                badge={pendingRecords.length > 0 ? `${pendingRecords.length}条待复查` : "暂无待复查"}
                tone={pendingRecords.length > 0 ? "amber" : "emerald"}
              >
                <div className="space-y-2 text-sm leading-6 text-slate-600">
                  {pendingRecords.slice(0, 3).map((record) => {
                    const child = visibleChildren.find((item) => item.id === record.childId);
                    return (
                      <div key={`teacher-growth-focus-${record.id}`} className="rounded-lg bg-white/80 px-3 py-2">
                        <span className="font-semibold text-slate-900">{child?.name ?? "未识别幼儿"}</span>
                        <span className="text-slate-400"> · </span>
                        <span>{record.category}</span>
                        <span className="text-slate-400"> · </span>
                        <span>{record.followUpAction ?? record.description}</span>
                      </div>
                    );
                  })}
                  {pendingRecords.length === 0 ? (
                    <p>当前筛选下暂无待复查记录，可以继续新增观察或生成班级周总结。</p>
                  ) : null}
                </div>
              </TeacherMiniPanel>
            </div>
          ) : null}

          <div data-testid="r05-growth-chart-suite" className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="观察维度分布" description="把近期观察重点直接转成图表，更容易讲清楚班级关注面。" minHeight="22rem">
              <div className="grid gap-5">
                <ReplicaLineChart
                  data={categoryTrendRows}
                  testId="r05-growth-category-trend"
                  height={180}
                  series={trendKeys.map((key, index) => ({
                    key,
                    label: key,
                    color: GROWTH_CHART_COLORS[index % GROWTH_CHART_COLORS.length],
                    unit: "条",
                  }))}
                  emptyMessage="暂无近 7 天成长观察趋势。"
                />
                <ReplicaDonutChart
                  data={categoryDistributionRows}
                  testId="r05-growth-category-donut"
                  height={265}
                  totalLabel="总记录"
                  unit="条"
                  emptyMessage="暂无观察维度分布数据。"
                />
              </div>
            </ChartCard>

            <ChartCard title="复查状态对比" description="用柱状图快速说明当前待追踪工作量和已闭环完成度。" minHeight="18rem">
              <ReplicaBarChart
                data={reviewStatusRows}
                testId="r05-growth-review-bars"
                height={270}
                series={[{ key: "count", label: "数量", color: replicaChartColors.amber, unit: "条" }]}
                emptyMessage="暂无复查状态数据。"
              />
            </ChartCard>
          </div>

          <FilterBar
            filters={
              <>
                <Select value={filterValue} onValueChange={setFilterValue}>
                  <SelectTrigger className="min-w-44">
                    <SelectValue placeholder="筛选维度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部维度</SelectItem>
                    {BEHAVIOR_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger className="min-w-44">
                    <SelectValue placeholder="筛选复查状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部状态</SelectItem>
                    <SelectItem value="待复查">待复查</SelectItem>
                    <SelectItem value="已完成">已完成</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />

          <Card className="rounded-lg">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg">观察台账</CardTitle>
                <CardDescription>可按维度与复查状态过滤，便于教师与家长共同追踪变化。</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {timelineRecords.length === 0 ? (
                <EmptyState
                  icon={<Workflow className="h-6 w-6" />}
                  title="当前筛选条件下暂无观察记录"
                  description="可以切换观察维度、复查状态，或先新增一条成长观察记录。"
                />
              ) : null}
              {timelineRecords.map((record) => {
                const child = visibleChildren.find((item) => item.id === record.childId);
                if (!child) return null;
                return (
                  <article
                    key={record.id}
                    data-testid="growth-record-card"
                    data-child-id={record.childId}
                    className="group/card relative rounded-3xl border border-slate-100 bg-white p-5 pl-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:border-indigo-100"
                  >
                    <span className="absolute bottom-5 left-5 top-5 border-l-2 border-dashed border-slate-200" />
                    <span className="absolute left-3.25 top-8 h-4 w-4 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={record.needsAttention ? "warning" : "secondary"}>
                            {record.category}
                          </Badge>
                          <Badge variant="info">{child.name}</Badge>
                          <Badge variant="secondary">{child.className}</Badge>
                          <Badge variant={record.reviewStatus === "待复查" ? "warning" : "success"}>
                            {record.reviewStatus ?? "已完成"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{record.description}</p>
                        <GrowthRecordMediaStrip
                          sources={getGrowthMediaSources(record)}
                          alt={`${child.name} ${record.category} 成长影像`}
                          recordId={record.id}
                          childId={record.childId}
                        />
                        
                        {record.selectedIndicators && record.selectedIndicators.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500 font-medium">结构化指标达成：</span>
                            <div className="flex flex-wrap gap-2">
                              {record.selectedIndicators.map(ind => (
                                <Badge key={ind} variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {getIndicatorLabel(ind)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {record.followUpAction ? (
                          <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            跟进行动：{record.followUpAction}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-45 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5" />
                          <time dateTime={record.createdAt}>{record.createdAt}</time>
                        </div>
                        <p className="mt-2">记录人：{record.recorder}</p>
                        <p className="mt-1">角色：{record.recorderRole}</p>
                        <p className="mt-1">复查日期：{record.reviewDate ?? "未设置"}</p>
                        <p className="mt-1">年龄段：{getAgeBandFromBirthDate(child.birthDate)}</p>
                        <p className="mt-1">年龄：{getAgeText(child.birthDate)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Workflow className="h-5 w-5 text-indigo-500" />
                历史时间线
              </CardTitle>
              <CardDescription>将家庭观察、教师记录与复查动作放在同一条时间线中查看。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {timelineRecords.slice(0, 8).map((record) => {
                const child = visibleChildren.find((item) => item.id === record.childId);
                if (!child) return null;
                return (
                  <article key={`timeline-${record.id}`} className="relative rounded-2xl border border-slate-100 bg-white p-4 pl-8 shadow-sm">
                    <span className="absolute bottom-3 left-4 top-3 border-l-2 border-dashed border-slate-200" />
                    <span className="absolute left-2.25 top-6 h-3.5 w-3.5 rounded-full bg-indigo-400 ring-4 ring-indigo-100" />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{child.name} · {record.category}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{record.description}</p>
                      </div>
                      <div className="text-xs text-slate-400">
                        <p><time dateTime={record.createdAt}>{record.createdAt}</time></p>
                        <p className="mt-1">{record.recorderRole} · {record.recorder}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const GROWTH_CHART_COLORS = ["#818cf8", "#f59e0b", "#34d399", "#f472b6", "#38bdf8", "#fb7185"];
const GROWTH_MEDIA_FALLBACK = DEMO_MEDIA_FALLBACKS.growth;

type GrowthMediaSourceRecord = {
  mediaRefs?: unknown;
  mediaUrls?: unknown;
};

type GrowthRecordMediaStripProps = {
  sources: string[];
  alt: string;
  recordId: string;
  childId: string;
  compact?: boolean;
};

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeGrowthMediaPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("\\") || /^[A-Za-z]:/.test(trimmed)) return null;
  if (trimmed.startsWith("/demo-media/gpt-image2/growth/")) return trimmed;
  if (trimmed.startsWith("/demo-media/growth/")) return trimmed;
  return null;
}

function uniqueMediaSources(sources: string[]) {
  return Array.from(new Set(sources));
}

function getGrowthMediaSources(record?: GrowthMediaSourceRecord | null) {
  const sources = uniqueMediaSources(
    [...readStringList(record?.mediaRefs), ...readStringList(record?.mediaUrls)]
      .map(normalizeGrowthMediaPath)
      .filter((source): source is string => Boolean(source))
  );

  return sources.length > 0 ? sources : [GROWTH_MEDIA_FALLBACK];
}

function growthImageFallbackChain(initialSrc: string) {
  return initialSrc === GROWTH_MEDIA_FALLBACK
    ? [GROWTH_MEDIA_FALLBACK]
    : uniqueMediaSources([initialSrc, GROWTH_MEDIA_FALLBACK]);
}

function GrowthRecordImage({
  src,
  alt,
  compact,
  recordId,
  childId,
}: {
  src: string;
  alt: string;
  compact?: boolean;
  recordId: string;
  childId: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const fallbackChain = growthImageFallbackChain(src);
  const activeSrc = fallbackChain[activeIndex];

  if (!activeSrc || hidden) return null;

  return (
    <figure className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 ${compact ? "aspect-[4/3] max-w-44" : "aspect-[4/3]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-testid="growth-record-image"
        data-record-id={recordId}
        data-child-id={childId}
        src={activeSrc}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          if (activeIndex < fallbackChain.length - 1) {
            setActiveIndex((index) => index + 1);
            return;
          }
          setHidden(true);
        }}
      />
      <figcaption className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm">
        示例素材
      </figcaption>
    </figure>
  );
}

function GrowthRecordMediaStrip({ sources, alt, recordId, childId, compact = false }: GrowthRecordMediaStripProps) {
  const displaySources = (sources.length > 0 ? sources : [GROWTH_MEDIA_FALLBACK]).slice(0, compact ? 1 : 3);

  return (
    <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : displaySources.length > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:max-w-64"}`}>
      {displaySources.map((source, index) => (
        <GrowthRecordImage
          key={`${recordId}-${source}-${index}`}
          src={source}
          alt={alt}
          compact={compact}
          recordId={recordId}
          childId={childId}
        />
      ))}
    </div>
  );
}

function buildRecentDateRange(days: number) {
  return buildRecentLocalDateRange(days);
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeRecordDate(value: string) {
  return normalizeLocalDate(value);
}
