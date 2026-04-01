"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/store";
import AnimatedNumber from "@/components/AnimatedNumber";
import ScrollReveal from "@/components/ScrollReveal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { Users, ClipboardCheck, AlertTriangle, MessageSquare, Activity, Monitor, Wifi, Thermometer, HeartPulse } from "lucide-react";
import { useState, useEffect } from "react";
import { buildRecentLocalDateRange, getLocalToday } from "@/lib/date";

export default function TeacherDashboardPage() {
  const { visibleChildren, getTodayAttendance, healthCheckRecords, guardianFeedbacks, growthRecords } = useApp();

  const todayStr = getLocalToday();

  const totalChildren = visibleChildren.length;
  const attendanceToday = getTodayAttendance();
  const presentCount = attendanceToday.filter((r) => r.isPresent).length;
  const presentRate = totalChildren > 0 ? Math.round((presentCount / totalChildren) * 100) : 0;

  const todayHealthChecks = healthCheckRecords.filter((r) => r.date === todayStr);
  const abnormalCount = todayHealthChecks.filter((r) => r.isAbnormal).length;

  const todayFeedbacks = guardianFeedbacks.filter((r) => r.date === todayStr);

  // IoT Mocks
  const [envTemp, setEnvTemp] = useState(24.5);

  useEffect(() => {
    const timer = setInterval(() => {
      setEnvTemp(prev => Number((prev + (Math.random() - 0.5) * 0.2).toFixed(1)));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Growth Alerts
  const growthAlerts = useMemo(() => {
    return growthRecords
      .filter((r) => r.needsAttention)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [growthRecords]);

  // Health Chart Data - Last 7 Days Avg Temp
  const healthTrendData = useMemo(() => {
    const arr = [];
    for (const ds of buildRecentLocalDateRange(7)) {
      const records = healthCheckRecords.filter(r => r.date === ds);
      const avgTemp = records.length > 0 
        ? records.reduce((sum, r) => sum + r.temperature, 0) / records.length 
        : 36.5;
        
      arr.push({
        date: ds.slice(5),
        AvgTemp: Number(avgTemp.toFixed(1))
      });
    }
    return arr;
  }, [healthCheckRecords]);

  // Intervention Effect Chart (Mocking Before vs After)
  const interventionData = [
    { category: "午睡入睡", before: 45, after: 20, unit: "分钟" },
    { category: "偏食拒食", before: 8, after: 2, unit: "次/周" },
    { category: "大动作达标", before: 60, after: 85, unit: "%" },
    { category: "情绪崩溃", before: 5, after: 1, unit: "次/周" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-2xl">
            <Monitor className="h-8 w-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">机构端监控大屏</h1>
            <p className="text-sm text-slate-500 mt-1">全局掌控在园幼儿健康、成长情况及家园共育干预成果</p>
            <div className="section-divider mt-5" />
          </div>
        </div>
        
        {/* IoT Mock Panel */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-slate-600">IoT网关在线</span>
          </div>
          <div className="w-px h-4 bg-slate-200"></div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Wifi className="w-3.5 h-3.5 text-indigo-400" />
            智能手环活跃: {totalChildren}/{totalChildren}
          </div>
          <div className="w-px h-4 bg-slate-200"></div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Thermometer className="w-3.5 h-3.5 text-orange-400" />
            实时室温: {envTemp}°C
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <ScrollReveal>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="kpi-accent card-hover bg-linear-to-br from-indigo-50 to-white border-indigo-100 shadow-sm relative overflow-hidden border-l-4 border-l-indigo-300">
          <div className="absolute top-0 right-0 p-4 opacity-[0.07]">
            <Users className="w-20 h-20" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">在园总人数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-indigo-900"><AnimatedNumber value={totalChildren} /></div>
            <p className="text-xs text-indigo-600/80 mt-1 font-medium">全机构注册幼儿</p>
          </CardContent>
        </Card>

        <Card className="kpi-accent card-hover bg-linear-to-br from-emerald-50 to-white border-emerald-100 shadow-sm relative overflow-hidden border-l-4 border-l-emerald-300">
          <div className="absolute top-0 right-0 p-4 opacity-[0.07]">
            <ClipboardCheck className="w-20 h-20" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">今日出勤率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-emerald-700"><AnimatedNumber value={presentRate} suffix="%" /></div>
            <p className="text-xs text-emerald-600/80 mt-1 font-medium">实到 {presentCount} 人</p>
          </CardContent>
        </Card>

        <Card className="kpi-accent card-hover bg-linear-to-br from-rose-50 to-white border-rose-100 shadow-sm relative overflow-hidden border-l-4 border-l-rose-300">
          <div className="absolute top-0 right-0 p-4 opacity-[0.07]">
            <AlertTriangle className="w-20 h-20" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">晨检异常预警</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-rose-600"><AnimatedNumber value={abnormalCount} /></div>
            <p className="text-xs text-rose-500/80 mt-1 font-medium">今日健康预警人数</p>
          </CardContent>
        </Card>

        <Card className="kpi-accent card-hover bg-linear-to-br from-amber-50 to-white border-amber-100 shadow-sm relative overflow-hidden border-l-4 border-l-amber-300">
          <div className="absolute top-0 right-0 p-4 opacity-[0.07]">
            <MessageSquare className="w-20 h-20" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">今日家园反馈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-amber-600"><AnimatedNumber value={todayFeedbacks.length} /></div>
            <p className="text-xs text-amber-600/80 mt-1 font-medium">家长通过在线端提交</p>
          </CardContent>
        </Card>
      </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Big Charts */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-none border-slate-200">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-indigo-500" />
                    AI 智慧干预效果对比分析
                  </CardTitle>
                  <CardDescription className="mt-1">上周报告生成个性化干预建议执行后的机构幼儿整体指标变化</CardDescription>
                </div>
                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none shrink-0 w-fit">干预效果显著</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-75 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={interventionData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: "#F8FAFC" }} 
                      contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} 
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
                    <Bar dataKey="before" name="干预前 (上周)" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="after" name="干预后 (本周)" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-800">
                 机构近七日健康均温监测
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-55 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={healthTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                    <YAxis domain={['dataMin - 0.2', 'dataMax + 0.2']} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dx={-10} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0" }} />
                    <Area type="monotone" dataKey="AvgTemp" name="平均体温 (℃)" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorTemp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Alerts & Lists */}
        <div className="space-y-6">
          <Card className="shadow-none border-rose-100 flex flex-col h-full bg-white object-cover">
            <CardHeader className="bg-rose-50/50 rounded-t-xl pb-4 border-b border-rose-100/60">
              <div className="flex justify-between items-center">
                <CardTitle className="text-rose-800 flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5" />
                  重点预警名单
                </CardTitle>
                <div className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {growthAlerts.length}
                </div>
              </div>
              <CardDescription className="text-rose-700/70 text-xs mt-1">
                需要教师二次复查干预的成长记录
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0">
              <div className="divide-y divide-slate-100">
                {growthAlerts.map((alert) => {
                  const child = visibleChildren.find(c => c.id === alert.childId);
                  return (
                    <div key={alert.id} className="p-5 hover:bg-slate-50/80 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-semibold text-slate-800 text-sm">
                          {child?.name || "未知"} 
                          <span className="text-xs font-normal text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded-md">
                            {alert.category}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-600 bg-rose-50">
                          待复查
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{alert.description}</p>
                      
                      {alert.followUpAction && (
                       <div className="mt-3 bg-white p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600 shadow-sm flex flex-col gap-1 relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.75 before:bg-indigo-400 before:rounded-r-md">
                         <span className="font-semibold text-indigo-900 ml-2">建议干预措施：</span>
                         <span className="line-clamp-2 ml-2 leading-relaxed">{alert.followUpAction}</span>
                       </div>
                      )}
                    </div>
                  )
                })}
                {growthAlerts.length === 0 && (
                  <div className="p-5">
                    <EmptyState
                      icon={<HeartPulse className="h-6 w-6" />}
                      title="目前没有重点预警名单"
                      description="当前成长与健康数据整体平稳，暂时无需教师额外复查。"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
