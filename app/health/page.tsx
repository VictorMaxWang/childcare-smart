"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, MessageSquareText, Search, ShieldAlert, Thermometer, Users, Utensils } from "lucide-react";
import { useApp } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ReplicaDonutChart,
  ReplicaLineChart,
  replicaChartColors,
  type ReplicaChartDatum,
  type ReplicaDonutDatum,
} from "@/components/charts";
import { ChartCard } from "@/components/ui/chart-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { buildRecentLocalDateRange, getLocalToday, isDateWithinLastDays } from "@/lib/date";
import { createRecord, updateRecord } from "@/lib/api/records";
import { toast } from "sonner";

import { HEALTH_MOOD_OPTIONS, HAND_MOUTH_EYE_OPTIONS, TEMPERATURE_THRESHOLD } from "@/lib/mock/health";
import { getAgeText } from "@/lib/store";
import EmptyState from "@/components/EmptyState";
import { useParentD01Data } from "@/components/parent/useParentD01Data";
import { MetricCard } from "@/components/ui/metric-card";

const TEMPLATE_REMARKS = {
  NORMAL: "体温正常，情绪稳定",
  SLIGHT_COUGH: "轻微咳嗽，需观察",
  LOW_FEVER: "低烧，已通知家长"
};

const TEMPERATURE_MIN = 34;
const TEMPERATURE_MAX = 42;

export default function HealthPage() {
  const {
    presentChildren,
    healthCheckRecords,
    upsertHealthCheck,
    currentUser,
    visibleChildren,
    reloadAppSnapshotFromApi,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child");
  const parentD01 = useParentD01Data(childFromQuery);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "abnormal" | "unchecked">("all");
  const isParent = currentUser.role === "家长";
  
  // Dialog State
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string>("36.5");
  const [temperatureError, setTemperatureError] = useState("");
  const [mood, setMood] = useState<string>(HEALTH_MOOD_OPTIONS[0].label);
  const [handMouthEye, setHandMouthEye] = useState<"正常" | "异常">("正常");
  const [remark, setRemark] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [savingHealthCheck, setSavingHealthCheck] = useState(false);

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

  // Computed data — use visibleChildren so admin/teacher can see all children, not just present ones
  const childData = useMemo(() => {
    const today = getLocalToday();
    return visibleChildren.map(child => {
      const todayRecord = healthCheckRecords.find(r => r.childId === child.id && r.date === today);
      return { 
        ...child, 
        health: todayRecord 
      };
    });
  }, [visibleChildren, healthCheckRecords]);

  const filteredChildren = useMemo(() => {
    const presentChildIds = new Set(presentChildren.map((child) => child.id));
    return childData.filter(child => {
      const matchesSearch = child.name.includes(searchTerm) || (child.nickname && child.nickname.includes(searchTerm));
      if (!matchesSearch) return false;
      
      if (filterStatus === "unchecked") return presentChildIds.has(child.id) && !child.health;
      if (filterStatus === "abnormal") return child.health?.isAbnormal;
      
      return true;
    });
  }, [childData, presentChildren, searchTerm, filterStatus]);

  const stats = useMemo(() => {
    const presentChildIds = new Set(presentChildren.map((child) => child.id));
    const total = childData.length;
    const present = presentChildren.length;
    const checked = childData.filter((child) => presentChildIds.has(child.id) && child.health).length;
    const abnormal = childData.filter((child) => presentChildIds.has(child.id) && child.health?.isAbnormal).length;
    return { total, present, checked, abnormal, unchecked: Math.max(present - checked, 0) };
  }, [childData, presentChildren]);

  const weeklyTemperatureData = useMemo(() => {
    const visibleIds = new Set(visibleChildren.map((child) => child.id));
    return buildRecentDateRange(7).map((date) => {
      const records = healthCheckRecords.filter(
        (record) => visibleIds.has(record.childId) && record.date === date
      );
      const avgTemperature =
        records.length > 0
          ? Math.round((records.reduce((sum, item) => sum + item.temperature, 0) / records.length) * 10) / 10
          : null;
      const abnormalCount = records.filter((record) => record.isAbnormal).length;

      return {
        label: formatShortDate(date),
        avgTemperature,
        abnormalCount,
      };
    });
  }, [healthCheckRecords, visibleChildren]);

  const moodDistributionData = useMemo(() => {
    const visibleIds = new Set(visibleChildren.map((child) => child.id));
    const counter = new Map<string, number>();

    healthCheckRecords.forEach((record) => {
      if (!visibleIds.has(record.childId) || !isRecentDate(record.date, 7)) return;
      counter.set(record.mood, (counter.get(record.mood) ?? 0) + 1);
    });

    return Array.from(counter.entries()).map(([name, value]) => ({ name, value }));
  }, [healthCheckRecords, visibleChildren]);

  const moodColorMap = useMemo(
    () => new Map(moodDistributionData.map((item, index) => [item.name, HEALTH_CHART_COLORS[index % HEALTH_CHART_COLORS.length]])),
    [moodDistributionData]
  );

  const moodTrendKeys = useMemo(
    () => [...moodDistributionData].sort((left, right) => right.value - left.value).slice(0, 3).map((item) => item.name),
    [moodDistributionData]
  );

  const moodTrendData = useMemo(() => {
    const visibleIds = new Set(visibleChildren.map((child) => child.id));

    return buildRecentDateRange(7).map((date) => {
      const dayCounter = new Map<string, number>();
      healthCheckRecords.forEach((record) => {
        if (!visibleIds.has(record.childId) || record.date !== date) return;
        dayCounter.set(record.mood, (dayCounter.get(record.mood) ?? 0) + 1);
      });

      const row: Record<string, string | number> = {
        label: formatShortDate(date),
      };

      moodTrendKeys.forEach((key) => {
        row[key] = dayCounter.get(key) ?? 0;
      });

      return row;
    });
  }, [healthCheckRecords, visibleChildren, moodTrendKeys]);
  const weeklyTemperatureChartRows = useMemo<ReplicaChartDatum[]>(
    () =>
      weeklyTemperatureData.map((item) => ({
        label: item.label,
        avgTemperature: item.avgTemperature,
        abnormalCount: item.abnormalCount,
        feverLine: TEMPERATURE_THRESHOLD,
      })),
    [weeklyTemperatureData]
  );
  const moodTrendChartRows = useMemo<ReplicaChartDatum[]>(
    () => moodTrendData.map((item) => ({ ...item, label: String(item.label) })),
    [moodTrendData]
  );
  const moodDistributionRows = useMemo<ReplicaDonutDatum[]>(
    () =>
      moodDistributionData.map((item, index) => ({
        label: item.name,
        value: item.value,
        color: HEALTH_CHART_COLORS[index % HEALTH_CHART_COLORS.length],
      })),
    [moodDistributionData]
  );

  // Actions
  const handleOpenDialog = (childId: string) => {
    const child = childData.find(c => c.id === childId);
    if (!child) return;
    setTemperatureError("");
    
    if (child.health) {
      setTemperature(String(child.health.temperature));
      setMood(child.health.mood);
      setHandMouthEye(child.health.handMouthEye);
      setRemark(child.health.remark || "");
    } else {
      setTemperature("36.5");
      setMood(HEALTH_MOOD_OPTIONS[0].label);
      setHandMouthEye("正常");
      setRemark(TEMPLATE_REMARKS.NORMAL);
    }
    
    setSelectedChildId(childId);
    setIsDialogOpen(true);
  };

  const handleSaveHealthCheck = async () => {
    if (!selectedChildId) return;
    
    const trimmedTemperature = temperature.trim();
    const tempNum = Number(trimmedTemperature);
    if (!trimmedTemperature || !Number.isFinite(tempNum)) {
      const message = "请填写有效体温。";
      setTemperatureError(message);
      toast.warning("晨检记录未保存", {
        description: message,
      });
      return;
    }

    if (tempNum < TEMPERATURE_MIN || tempNum > TEMPERATURE_MAX) {
      const message = `体温需在 ${TEMPERATURE_MIN.toFixed(1)}-${TEMPERATURE_MAX.toFixed(1)}°C 之间。`;
      setTemperatureError(message);
      toast.warning("晨检记录未保存", {
        description: message,
      });
      return;
    }

    setTemperatureError("");
    const isTempAbnormal = tempNum >= TEMPERATURE_THRESHOLD;
    const isAbnormal = isTempAbnormal || handMouthEye === "异常" || mood.includes("哭闹");
    const childName = childData.find((child) => child.id === selectedChildId)?.name ?? "该幼儿";

    if (currentUser.accountKind === "normal") {
      setSavingHealthCheck(true);
      try {
        const existing = childData.find((child) => child.id === selectedChildId)?.health;
        const payload = {
          childId: selectedChildId,
          date: getLocalToday(),
          temperature: tempNum,
          mood,
          handMouthEye,
          isAbnormal,
          remark,
        };
        if (existing) {
          await updateRecord("health", existing.id, payload);
        } else {
          await createRecord("health", payload);
        }
        const reloadResult = await reloadAppSnapshotFromApi();
        if (reloadResult.status === "failed") {
          toast.warning("晨检记录已写入服务端", {
            description: "页面刷新暂时失败，请手动刷新后查看最新记录。",
          });
        } else if (isAbnormal) {
          toast.warning("晨检记录已保存", {
            description: `${childName} 已标记为异常状态，请及时复核并通知家长。记录已同步到服务端。`,
          });
        } else {
          toast.success("晨检记录已保存", {
            description: `${childName} 的今日晨检状态已同步到服务端。`,
          });
        }
        setIsDialogOpen(false);
      } catch (requestError) {
        toast.error("晨检记录保存失败", {
          description:
            requestError instanceof Error ? requestError.message : "服务端写入失败，请重试。",
        });
      } finally {
        setSavingHealthCheck(false);
      }
      return;
    }

    const saveResult = upsertHealthCheck({
      childId: selectedChildId,
      temperature: tempNum,
      mood,
      handMouthEye,
      isAbnormal,
      remark
    });

    if (saveResult.status === "failed") {
      toast.error("晨检记录保存失败", {
        description: saveResult.message,
      });
      return;
    }

    const persistenceNote =
      saveResult.status === "local_only"
        ? "已写入共享演示数据，刷新和切换角色仍可查看。"
        : "已写入当前数据层，刷新后保留。";
    if (isAbnormal) {
      toast.warning("晨检记录已保存", {
        description: `${childName} 已标记为异常状态，请及时复核并通知家长。${persistenceNote}`,
      });
    } else {
      toast.success("晨检记录已保存", {
        description: `${childName} 的今日晨检状态已更新。${persistenceNote}`,
      });
    }

    setIsDialogOpen(false);
  };
  
if (isParent) {
    const parentChild = parentD01.selectedChild;
    const parentHealthRecords = (parentD01.parentHomeData?.dailyRecords ?? [])
      .filter((record) => record.type === "morning-check")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestHealthRecord = parentHealthRecords[0] ?? null;
    const abnormalHealthRecords = parentHealthRecords.filter((record) => Boolean(record.payload.isAbnormal));
    const healthMaterials = parentD01.parentHomeData?.healthMaterials ?? [];
    const consultations = parentD01.parentHomeData?.consultations ?? [];

    if (parentD01.invalidChildId) {
      return (
        <div className="app-page flex min-h-[70vh] items-center justify-center page-enter">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="无法查看该孩子的健康管理"
            description="当前家长账号没有该 childId 的授权，系统不会自动回退到其他孩子。"
          />
        </div>
      );
    }

    if (!parentChild || !parentD01.parentHomeData) {
      return (
        <div className="app-page flex min-h-[70vh] items-center justify-center page-enter">
          <EmptyState
            icon={<HeartPulse className="h-6 w-6" />}
            title="暂无可查看的健康数据"
            description="当前账号还没有关联孩子，或 D01 store 中没有健康记录。"
          />
        </div>
      );
    }

    return (
      <div className="app-page max-w-[76rem] page-enter">
        <section className="mb-5 overflow-hidden rounded-2xl border border-rose-100 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_50%,#ecfeff_100%)] p-4 shadow-[0_20px_58px_rgb(244_63_94_/_0.10)] sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="rounded-full px-3 py-1">
                  {parentChild.name}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {parentChild.className}
                </Badge>
                <Badge variant={abnormalHealthRecords.length > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">
                  异常 {abnormalHealthRecords.length} 条
                </Badge>
              </div>
              <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                <HeartPulse className="h-7 w-7 text-rose-500" />
                健康管理
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                家长端只读展示晨检、健康材料和高风险会诊摘要，数据按 childId 从 D01 store 读取。
              </p>
            </div>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => router.push(`/parent?child=${parentChild.id}`)}>
              返回首页
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <MetricCard label="晨检记录" value={`${parentHealthRecords.length} 条`} icon={<Thermometer className="h-5 w-5" />} tone="info" />
            <MetricCard
              label="异常记录"
              value={`${abnormalHealthRecords.length} 条`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={abnormalHealthRecords.length > 0 ? "warning" : "success"}
            />
            <MetricCard label="健康材料" value={`${healthMaterials.length} 份`} icon={<Activity className="h-5 w-5" />} tone="primary" />
            <MetricCard label="会诊摘要" value={`${consultations.length} 条`} icon={<Users className="h-5 w-5" />} tone="neutral" />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">晨检与异常记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {parentHealthRecords.length === 0 ? (
                <EmptyState
                  icon={<Thermometer className="h-6 w-6" />}
                  title="暂无晨检记录"
                  description="当前 childId 在 D01 store 中还没有晨检数据。"
                />
              ) : null}
              {parentHealthRecords.map((record) => {
                const temperature = typeof record.payload.temperature === "number" ? record.payload.temperature : null;
                const moodText = typeof record.payload.mood === "string" ? record.payload.mood : "未记录";
                const handMouthEye = typeof record.payload.handMouthEye === "string" ? record.payload.handMouthEye : "未记录";
                const remark = typeof record.payload.remark === "string" ? record.payload.remark : "暂无备注";
                const isAbnormal = Boolean(record.payload.isAbnormal);
                return (
                  <article key={record.recordId} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={isAbnormal ? "destructive" : "success"}>{isAbnormal ? "异常" : "正常"}</Badge>
                          <Badge variant="secondary">{record.createdAt}</Badge>
                          <Badge variant="outline">记录人：{record.createdBy}</Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          体温 {temperature === null ? "--" : `${temperature.toFixed(1)}°C`}，情绪 {moodText}，手口眼 {handMouthEye}
                        </p>
                        <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{remark}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">最近状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                {latestHealthRecord ? (
                  <>
                    <p className="font-semibold text-slate-900">{latestHealthRecord.createdAt}</p>
                    <p>
                      体温：
                      {typeof latestHealthRecord.payload.temperature === "number"
                        ? `${latestHealthRecord.payload.temperature.toFixed(1)}°C`
                        : "--"}
                    </p>
                    <p>情绪：{typeof latestHealthRecord.payload.mood === "string" ? latestHealthRecord.payload.mood : "未记录"}</p>
                    <p>手口眼：{typeof latestHealthRecord.payload.handMouthEye === "string" ? latestHealthRecord.payload.handMouthEye : "未记录"}</p>
                  </>
                ) : (
                  <p>暂无晨检状态。</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">健康材料</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {healthMaterials.length === 0 ? (
                  <EmptyState
                    icon={<Activity className="h-6 w-6" />}
                    title="暂无健康材料"
                    description="当前孩子还没有上传或解析的健康材料。"
                  />
                ) : null}
                {healthMaterials.map((material) => (
                  <div key={material.materialId} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{material.filename}</p>
                      <Badge variant={material.parseStatus === "completed" ? "success" : material.parseStatus === "failed" ? "destructive" : "secondary"}>
                        {material.parseStatus}
                      </Badge>
                    </div>
                    <p className="mt-2 text-slate-500">{material.description ?? "暂无说明"}</p>
                    {material.parseResult ? (
                      <pre className="mt-2 max-h-32 overflow-auto rounded-xl bg-white p-2 text-xs text-slate-500">
                        {JSON.stringify(material.parseResult, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">会诊摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {consultations.length === 0 ? <p className="text-sm text-slate-500">暂无会诊摘要。</p> : null}
                {consultations.slice(0, 3).map((consultation) => (
                  <div key={consultation.consultationId} className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={consultation.riskLevel === "high" ? "destructive" : "warning"}>{consultation.riskLevel}</Badge>
                      <span className="text-xs text-amber-700">{consultation.generatedAt}</span>
                    </div>
                    <p className="mt-2 leading-6 text-slate-700">{consultation.summary}</p>
                    <p className="mt-2 text-xs text-slate-500">家庭建议：{consultation.homeAction}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const isTeacher = currentUser.role === "教师";
  const previewTemperature = temperature.trim() ? Number(temperature) : NaN;
  const isPreviewTemperatureAbnormal =
    Number.isFinite(previewTemperature) && previewTemperature >= TEMPERATURE_THRESHOLD;

  return (
    <div className="app-page max-w-[86rem] page-enter" data-testid="r05-health-page">
      {isTeacher ? (
        <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#eef2ff_100%)] p-4 shadow-[0_22px_64px_rgb(99_102_241_/_0.12)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-3xl ring-1 ring-indigo-100">👩‍🏫</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="rounded-full px-3 py-1">{currentUser.className ?? "当前班级"} · {stats.total}名幼儿</Badge>
                  <Badge variant={stats.abnormal > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">
                    {stats.abnormal > 0 ? "有异常需处理" : "今日稳定"}
                  </Badge>
                </div>
                <h1 className="mt-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  早上好，{currentUser.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  记录晨检与健康状况，守护孩子每一天的健康成长。
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" className="min-h-11 rounded-2xl" onClick={() => setFilterStatus("unchecked")}>
              今日 {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
            </Button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "应到人数", value: `${stats.total}人`, helper: `在园 ${stats.present}人`, icon: Users, tone: "bg-indigo-50 text-indigo-700" },
                { label: "已完成", value: `${stats.checked}人`, helper: `${stats.present ? Math.round((stats.checked / stats.present) * 100) : 0}%`, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
                { label: "异常", value: `${stats.abnormal}人`, helper: `${stats.present ? Math.round((stats.abnormal / stats.present) * 100) : 0}%`, icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
                { label: "未完成", value: `${stats.unchecked}人`, helper: "需补录", icon: Activity, tone: "bg-slate-100 text-slate-600" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
                    onClick={() => setFilterStatus(item.label === "异常" ? "abnormal" : item.label === "未完成" ? "unchecked" : "all")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
                      </div>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${item.tone}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "快速录入", detail: "批量晨检", icon: Users, action: () => setFilterStatus("unchecked") },
              { label: "体温登记", detail: "批量录入", icon: Thermometer, action: () => setFilterStatus("unchecked") },
              { label: "健康小贴士", detail: "今日建议", icon: Activity, action: () => window.location.assign("/teacher/agent?action=communication") },
              { label: "查看全部", detail: "重置筛选", icon: CheckCircle2, action: () => setFilterStatus("all") },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} type="button" className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200" onClick={item.action}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: `全部 ${stats.present}` },
                  { value: "unchecked", label: `未完成 ${stats.unchecked}` },
                  { value: "abnormal", label: `异常 ${stats.abnormal}` },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${filterStatus === item.value ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-50 text-slate-600 ring-1 ring-slate-100"}`}
                    onClick={() => setFilterStatus(item.value as typeof filterStatus)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setFilterStatus("unchecked")}>
                筛选
              </Button>
            </div>
            <div className="space-y-3">
              {filteredChildren.slice(0, 6).map((child) => {
                const isChecked = Boolean(child.health);
                const isAbnormal = child.health?.isAbnormal;
                return (
                  <button
                    key={`teacher-health-${child.id}`}
                    type="button"
                    onClick={() => handleOpenDialog(child.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                      isAbnormal ? "border-rose-200 bg-rose-50/70" : "border-slate-100 bg-slate-50/70"
                    }`}
                  >
                    <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                          {child.gender === "男" ? "👦" : "👧"}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-950">{child.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {isChecked ? `体温 ${child.health!.temperature.toFixed(1)}°C` : "未录入体温"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${isAbnormal ? "text-rose-600" : isChecked ? "text-emerald-600" : "text-slate-500"}`}>
                          {isAbnormal ? "发热 / 需关注" : isChecked ? "无异常" : "待晨检"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {isChecked ? `${child.health!.mood}，${child.health!.handMouthEye}` : "暂无记录"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-sm text-slate-400">{isChecked ? "08:25" : "未完成"}</span>
                        <Badge variant={isAbnormal ? "destructive" : isChecked ? "success" : "outline"}>
                          {isChecked ? "已完成" : "去录入"}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {stats.abnormal > 0 ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-semibold text-slate-950">异常提醒</p>
                    <p className="mt-1 text-sm text-slate-600">当前 {stats.abnormal} 人需关注，请优先复核并同步家长。</p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setFilterStatus("abnormal")}>去查看</Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
      <section className="mb-5 overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fbff_50%,#eef2ff_100%)] p-4 shadow-[0_20px_60px_rgb(14_165_233_/_0.10)] sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="rounded-full px-3 py-1">
                    {isTeacher ? currentUser.className ?? "当前班级" : "全园健康"}
                  </Badge>
                  <Badge variant={stats.abnormal > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">
                    {stats.abnormal > 0 ? "有异常需处理" : "今日稳定"}
                  </Badge>
                </div>
                <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  <Thermometer className="h-7 w-7 text-sky-500" />
                  晨检健康工作台
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  先处理待检与异常，再查看体温趋势和情绪分布，移动端优先呈现儿童状态卡。
                </p>
              </div>
              <Button type="button" variant="premium" className="min-h-11 rounded-2xl" onClick={() => setFilterStatus(stats.unchecked > 0 ? "unchecked" : "abnormal")}>
                查看优先队列
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: "可见幼儿", value: `${stats.total}人`, icon: Users, tone: "bg-sky-50 text-sky-700" },
                { label: "今日出勤", value: `${stats.present}人`, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
                { label: "已晨检", value: `${stats.checked}人`, icon: Activity, tone: "bg-indigo-50 text-indigo-700" },
                { label: "异常告警", value: `${stats.abnormal}人`, icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-white/82 bg-white/84 p-3 shadow-sm sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/82 bg-white/78 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">处理顺序</p>
            <div className="mt-4 space-y-3">
              {[
                { label: "待晨检", value: stats.unchecked, tone: "bg-amber-50 text-amber-700" },
                { label: "异常复核", value: stats.abnormal, tone: "bg-rose-50 text-rose-700" },
                { label: "趋势复盘", value: moodDistributionData.reduce((sum, item) => sum + item.value, 0), tone: "bg-indigo-50 text-indigo-700" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${item.tone}`}>{item.value}</span>
                </div>
              ))}
            </div>
            {isTeacher ? (
              <div className="mt-4 grid gap-2">
                <Button type="button" variant="outline" className="justify-start rounded-2xl" onClick={() => window.location.assign("/diet")}>
                  <Utensils className="mr-2 h-4 w-4" /> 同步饮食记录
                </Button>
                <Button type="button" variant="outline" className="justify-start rounded-2xl" onClick={() => window.location.assign("/teacher/agent?action=communication")}>
                  <MessageSquareText className="mr-2 h-4 w-4" /> 生成沟通建议
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      )}

      <div data-testid="r05-health-chart-suite" className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="一周体温趋势" description="对比平均体温、异常人数和发热阈值，使用 R03 共享图表组件。" minHeight="20rem">
          <ReplicaLineChart
            data={weeklyTemperatureChartRows}
            testId="r05-health-temperature-chart"
            height={270}
            series={[
              { key: "avgTemperature", label: "平均体温", color: replicaChartColors.sky, unit: "°C" },
              { key: "abnormalCount", label: "异常人数", color: replicaChartColors.red, unit: "人" },
              { key: "feverLine", label: "发热阈值", color: replicaChartColors.amber, unit: "°C" },
            ]}
          />
        </ChartCard>

        <ChartCard title="情绪分布图" description="近 7 天情绪趋势和占比，辅助园长识别班级压力。" minHeight="20rem">
          <div className="grid gap-5">
            <ReplicaLineChart
              data={moodTrendChartRows}
              testId="r05-health-mood-trend"
              height={170}
              series={moodTrendKeys.map((key, index) => ({
                key,
                label: key,
                color: moodColorMap.get(key) ?? HEALTH_CHART_COLORS[index % HEALTH_CHART_COLORS.length],
                unit: "次",
              }))}
              emptyMessage="暂无近 7 天情绪趋势数据。"
            />
            <ReplicaDonutChart
              data={moodDistributionRows}
              testId="r05-health-mood-donut"
              height={250}
              totalLabel="近7天记录"
              unit="次"
              emptyMessage="暂无情绪分布数据。"
            />
          </div>
        </ChartCard>
      </div>

      <FilterBar
        search={
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索幼儿姓名或乳名..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="搜索幼儿姓名或乳名"
              />
            </div>
        }
        filters={
            <fieldset className="flex gap-2 rounded-md bg-muted p-1">
              <legend className="sr-only">健康晨检筛选条件</legend>
              {[
                { value: "all", label: "全部" },
                { value: "unchecked", label: "待晨检" },
                { value: "abnormal", label: "异常警告" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-sm px-3 py-1 text-sm transition-all ${
                    filterStatus === option.value ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:bg-white/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="health-filter-status"
                    value={option.value}
                    checked={filterStatus === option.value}
                    onChange={() => setFilterStatus(option.value as typeof filterStatus)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
        }
        className="mt-6"
      />

      <Card className="mt-4 rounded-lg shadow-sm" data-testid="r05-health-record-list">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">今日晨检列表</CardTitle>
              <p className="mt-1 text-sm text-slate-500">点击儿童卡片可查看或补录体温、情绪、手口眼和备注。</p>
            </div>
            <StatusTag variant={stats.unchecked > 0 ? "warning" : "success"} showDot>
              待检 {stats.unchecked} 人
            </StatusTag>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChildren.map((child) => {
              const isChecked = !!child.health;
              const isAbnormal = child.health?.isAbnormal;
              
              return (
                <Card 
                  key={child.id} 
                  className={`overflow-hidden transition-all hover:shadow-md cursor-pointer border-l-4 ${!isChecked ? 'border-l-orange-300' : isAbnormal ? 'border-l-red-500 bg-red-50/30' : 'border-l-green-500'}`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenDialog(child.id)}
                    className="w-full p-4 text-left"
                    aria-label={`打开 ${child.name} 的晨检记录`}
                  >
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-full flex items-center justify-center bg-primary/10 text-xl shrink-0">
                      {child.gender === '男' ? '👦' : '👧'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium truncate">{child.name}</h3>
                        {isChecked ? (
                          isAbnormal ? (
                            <Badge variant="destructive" className="ml-2">异常</Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 hover:bg-green-100">正常</Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="ml-2 text-orange-600 border-orange-200">待检</Badge>
                        )}
                      </div>
                      
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                        <span>{getAgeText(child.birthDate)}</span>
                        <span>•</span>
                        <span>{child.className}</span>
                      </div>
                      
                      {isChecked && (
                        <div className="flex gap-3 text-sm">
                          <div className={`flex items-center gap-1 ${child.health!.temperature >= TEMPERATURE_THRESHOLD ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                            <Thermometer className="h-3.5 w-3.5" />
                            {child.health!.temperature.toFixed(1)}°C
                          </div>
                          <div className="text-gray-600 truncate border-l pl-3">
                            {child.health!.mood} · {child.health!.handMouthEye}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </button>
                </Card>
              );
            })}
          </div>
          
          {filteredChildren.length === 0 && (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="未找到符合条件的幼儿"
              description="可以尝试调整搜索词或切换筛选条件。"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              晨检记录 - {childData.find((c) => c.id === selectedChildId)?.name}
            </DialogTitle>
            <DialogDescription>
              记录由于今天的体温、情绪以及手口眼初步检查状态。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <FormField
              label="体温 (°C)"
              htmlFor="temperature"
              required
              error={temperatureError || (isPreviewTemperatureAbnormal ? `发热预警 (≥${TEMPERATURE_THRESHOLD}°C)` : undefined)}
            >
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={temperature}
                  min={TEMPERATURE_MIN}
                  max={TEMPERATURE_MAX}
                  onChange={(e) => {
                    setTemperature(e.target.value);
                    if (temperatureError) setTemperatureError("");
                  }}
                  aria-invalid={Boolean(temperatureError) || isPreviewTemperatureAbnormal}
                  className={temperatureError || isPreviewTemperatureAbnormal ? "text-red-600" : ""}
                />
            </FormField>
            
            <FormField label="手口眼" htmlFor="handMouthEye">
              <Select value={handMouthEye} onValueChange={(val) => setHandMouthEye(val as "正常" | "异常")}>
                <SelectTrigger id="handMouthEye">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HAND_MOUTH_EYE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="情绪状态" htmlFor="mood">
              <Select value={mood} onValueChange={setMood}>
                <SelectTrigger id="mood">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH_MOOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.label} value={opt.label}>{opt.emoji} {opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="备注说明" htmlFor="remark" description="可使用模板快速填充，也可以直接补充具体观察。">
              <div className="space-y-2">
                <Textarea
                  id="remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="检查补充说明..."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center rounded-full border border-input px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.NORMAL)}
                  >
                    常规正常
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center rounded-full border border-input px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.SLIGHT_COUGH)}
                  >
                    轻微咳嗽
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center rounded-full border border-input px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.LOW_FEVER)}
                  >
                    低烧观察
                  </button>
                </div>
              </div>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveHealthCheck()} loading={savingHealthCheck} data-testid="r05-health-save-check">
              保存记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const HEALTH_CHART_COLORS = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#fb7185", "#c084fc"];

function buildRecentDateRange(days: number) {
  return buildRecentLocalDateRange(days);
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function isRecentDate(dateString: string, days: number) {
  return isDateWithinLastDays(dateString, days);
}
