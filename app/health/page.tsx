"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Search, Thermometer, Users } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildRecentLocalDateRange, getLocalToday, isDateWithinLastDays } from "@/lib/date";
import { toast } from "sonner";

import { HEALTH_MOOD_OPTIONS, HAND_MOUTH_EYE_OPTIONS, TEMPERATURE_THRESHOLD } from "@/lib/mock/health";
import { getAgeText } from "@/lib/store";
import AnimatedNumber from "@/components/AnimatedNumber";
import ScrollReveal from "@/components/ScrollReveal";
import EmptyState from "@/components/EmptyState";

const TEMPLATE_REMARKS = {
  NORMAL: "体温正常，情绪稳定",
  SLIGHT_COUGH: "轻微咳嗽，需观察",
  LOW_FEVER: "低烧，已通知家长"
};

export default function HealthPage() {
  const { presentChildren, healthCheckRecords, upsertHealthCheck, currentUser, visibleChildren } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "abnormal" | "unchecked">("all");
  
  // Dialog State
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string>("36.5");
  const [mood, setMood] = useState<string>(HEALTH_MOOD_OPTIONS[0].label);
  const [handMouthEye, setHandMouthEye] = useState<"正常" | "异常">("正常");
  const [remark, setRemark] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  // Actions
  const handleOpenDialog = (childId: string) => {
    const child = childData.find(c => c.id === childId);
    if (!child) return;
    
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

  const handleSaveHealthCheck = () => {
    if (!selectedChildId) return;
    
    const tempNum = parseFloat(temperature);
    const isTempAbnormal = tempNum >= TEMPERATURE_THRESHOLD;
    const isAbnormal = isTempAbnormal || handMouthEye === "异常" || mood.includes("哭闹");

    upsertHealthCheck({
      childId: selectedChildId,
      temperature: tempNum,
      mood,
      handMouthEye,
      isAbnormal,
      remark
    });

    const childName = childData.find((child) => child.id === selectedChildId)?.name ?? "该幼儿";
    if (isAbnormal) {
      toast.warning("晨检记录已保存", {
        description: `${childName} 已标记为异常状态，请及时复核并通知家长。`,
      });
    } else {
      toast.success("晨检记录已保存", {
        description: `${childName} 的今日晨检状态已更新。`,
      });
    }

    setIsDialogOpen(false);
  };
  
  if (currentUser.role === "家长") {
    return (
      <div className="flex h-[80vh] items-center justify-center text-muted-foreground">
        <div className="text-center" role="alert" aria-live="assertive" aria-labelledby="health-denied-title" aria-describedby="health-denied-desc">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-500" aria-hidden="true" />
          <h2 id="health-denied-title" className="text-lg font-semibold">权限不足</h2>
          <p id="health-denied-desc">家长视图无法操作健康晨检页面，请返回主页或家长专属页。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
            <Thermometer className="h-8 w-8 text-sky-500" />
            晨检与健康
          </h1>
          <p className="text-muted-foreground mt-1">记录并追踪班级幼儿每日健康体征，及时预警异常情况。</p>
          <div className="section-divider mt-5" />
        </div>
      </div>

      <ScrollReveal>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="kpi-accent card-hover border-l-4 border-l-blue-300 shadow-sm border-blue-100 bg-blue-50/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-[0.07] pointer-events-none" aria-hidden>
            <Users className="w-20 h-20" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可见幼儿</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><AnimatedNumber value={stats.total} suffix="人" /></div>
          </CardContent>
        </Card>
        <Card className="kpi-accent card-hover border-l-4 border-l-green-300 shadow-sm border-green-100 bg-green-50/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-[0.07] pointer-events-none" aria-hidden>
            <CheckCircle2 className="w-20 h-20" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今日出勤</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><AnimatedNumber value={stats.present} suffix="人" /></div>
          </CardContent>
        </Card>
        <Card className="kpi-accent card-hover border-l-4 border-l-orange-300 shadow-sm border-orange-100 bg-orange-50/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-[0.07] pointer-events-none" aria-hidden>
            <Activity className="w-20 h-20" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已晨检</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><AnimatedNumber value={stats.checked} suffix="人" /></div>
          </CardContent>
        </Card>
        <Card className="kpi-accent card-hover border-l-4 border-l-red-300 shadow-sm border-red-100 bg-red-50/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-[0.07] pointer-events-none" aria-hidden>
            <AlertTriangle className="w-20 h-20" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">异常告警</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600"><AnimatedNumber value={stats.abnormal} suffix="人" /></div>
          </CardContent>
        </Card>
      </div>
      </ScrollReveal>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>一周体温趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-65 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTemperatureData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis yAxisId="temp" domain={[36, 38.5]} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                  <Legend />
                  <ReferenceLine yAxisId="temp" y={TEMPERATURE_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" label="37.3°C" />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="avgTemperature"
                    name="平均体温"
                    stroke="#0ea5e9"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="abnormalCount"
                    name="异常人数"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>情绪分布图</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">近 7 天情绪走势</p>
                  <p className="text-xs text-slate-500">自动提取记录量最高的 3 类情绪，先看趋势再看占比。</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {moodTrendKeys.map((key) => (
                    <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: moodColorMap.get(key) }} />
                      {key}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={moodTrendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`${value}次`, "出现次数"]} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                    {moodTrendKeys.map((key) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={moodColorMap.get(key) ?? "#94a3b8"}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="relative mt-5 h-[320px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moodDistributionData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={96}
                    innerRadius={46}
                    cy="50%"
                    labelLine={(props) => (
                      <path
                        d={props.points?.length ? `M ${props.points.map((point: { x: number; y: number }) => `${point.x},${point.y}`).join(" L ")}` : undefined}
                        fill="none"
                        stroke={props.stroke}
                        strokeWidth={1.5}
                      />
                    )}
                    label={renderMoodPieLabel}
                  >
                    {moodDistributionData.map((item, index) => (
                      <Cell key={item.name} fill={HEALTH_CHART_COLORS[index % HEALTH_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}次`, "记录数"]} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-white/92 px-6 py-4 text-center shadow-sm ring-1 ring-slate-100">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">近7天记录</p>
                  <p className="mt-1 text-2xl font-black text-slate-800">{moodDistributionData.reduce((sum, item) => sum + item.value, 0)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {moodDistributionData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: HEALTH_CHART_COLORS[index % HEALTH_CHART_COLORS.length] }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
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
        <DialogContent className="sm:max-w-106.25">
          <DialogHeader>
            <DialogTitle>
              晨检记录 - {childData.find((c) => c.id === selectedChildId)?.name}
            </DialogTitle>
            <DialogDescription>
              记录由于今天的体温、情绪以及手口眼初步检查状态。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="temperature" className="text-right">
                体温 (°C)
              </Label>
              <div className="col-span-3">
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className={parseFloat(temperature) >= TEMPERATURE_THRESHOLD ? "border-red-500 text-red-600" : ""}
                />
                {parseFloat(temperature) >= TEMPERATURE_THRESHOLD && (
                  <p className="text-xs text-red-500 mt-1">发热预警 (≥{TEMPERATURE_THRESHOLD}°C)</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="handMouthEye" className="text-right">
                手口眼
              </Label>
              <Select value={handMouthEye} onValueChange={(val) => setHandMouthEye(val as "正常" | "异常")}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HAND_MOUTH_EYE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mood" className="text-right">
                情绪状态
              </Label>
              <Select value={mood} onValueChange={setMood}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH_MOOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.label} value={opt.label}>{opt.emoji} {opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="remark" className="text-right mt-2">
                备注说明
              </Label>
              <div className="col-span-3 space-y-2">
                <Textarea
                  id="remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="检查补充说明..."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.NORMAL)}
                  >
                    常规正常
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.SLIGHT_COUGH)}
                  >
                    轻微咳嗽
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
                    onClick={() => setRemark(TEMPLATE_REMARKS.LOW_FEVER)}
                  >
                    低烧观察
                  </button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveHealthCheck}>
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

function renderMoodPieLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  x,
  y,
  name,
  value,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  x?: number;
  y?: number;
  name?: string;
  value?: number;
}) {
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof outerRadius !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !name ||
    typeof value !== "number"
  ) {
    return null;
  }

  const radius = outerRadius + 22;
  const radians = (-midAngle * Math.PI) / 180;
  const labelX = cx + radius * Math.cos(radians);
  const labelY = cy + radius * Math.sin(radians);
  const textAnchor = labelX > cx ? "start" : "end";

  return (
    <text x={labelX} y={labelY} fill="#475569" textAnchor={textAnchor} dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${name} ${value}`}
    </text>
  );
}
