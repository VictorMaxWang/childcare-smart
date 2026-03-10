"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookHeart,
  ClipboardList,
  CalendarDays,
  History,
  Salad,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/store";
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

export default function DashboardPage() {
  const {
    currentUser,
    visibleChildren,
    getTodayAttendance,
    getTodayMealRecords,
    getWeeklyDietTrend,
    getSmartInsights,
    getAdminBoardData,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    presentChildren,
  } = useApp();

  const todayAttendance = getTodayAttendance();
  const presentCount = todayAttendance.filter((item) => item.isPresent).length;
  const todayMeals = getTodayMealRecords();
  const weeklyTrend = getWeeklyDietTrend();
  const insights = getSmartInsights();
  const adminBoard = getAdminBoardData();
  const visibleIds = new Set(visibleChildren.map((child) => child.id));

  // Health Calculation
  const todayDate = new Date().toISOString().split("T")[0];
  const abnormalHealthChecks = healthCheckRecords.filter(
    (record) => record.date === todayDate && record.isAbnormal && visibleIds.has(record.childId)
  );
  
  const missingHealthChecks = presentChildren.filter(
    (child) => !healthCheckRecords.some(r => r.childId === child.id && r.date === todayDate)
  );

  const pendingReviews = growthRecords
    .filter((record) => visibleIds.has(record.childId) && record.reviewStatus === "待复查")
    .sort((a, b) => (a.reviewDate ?? "9999-12-31").localeCompare(b.reviewDate ?? "9999-12-31"));

  const recentTimeline = [
    ...todayAttendance.map((item) => ({
      id: `attendance-${item.id}`,
      dateTime: `${item.date} ${item.checkInAt ?? (item.isPresent ? "08:30" : "09:00")}`,
      title: item.isPresent ? "完成出勤登记" : "记录缺勤原因",
      detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${
        item.isPresent ? `在园 ${item.checkInAt ?? "08:30"} 入园` : item.absenceReason ?? "未到园"
      }`,
      type: item.isPresent ? "attendance" : "absence",
    })),
    ...todayMeals.map((item) => ({
      id: `meal-${item.id}`,
      dateTime: `${item.date} ${item.meal}`,
      title: `完成${item.meal}录入`,
      detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${item.foods
        .map((food) => food.name)
        .join("、")}`,
      type: "meal",
    })),
    ...guardianFeedbacks
      .filter((item) => visibleIds.has(item.childId) && item.date === new Date().toISOString().split("T")[0])
      .map((item) => ({
        id: `feedback-${item.id}`,
        dateTime: `${item.date} 20:00`,
        title: `收到家长反馈：${item.status}`,
        detail: `${visibleChildren.find((child) => child.id === item.childId)?.name ?? "幼儿"} · ${item.content}`,
        type: "feedback",
      })),
  ]
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
    .slice(0, 8);

  const flowSteps = [
    {
      title: "出勤",
      desc: `${presentCount} 人出勤，${todayAttendance.filter((item) => !item.isPresent).length} 人缺勤`,
      href: "/children",
      icon: "1",
    },
    {
      title: "健康晨检",
      desc: "支持批量出勤的幼儿进行健康状况快速录入",
      href: "/health",
      icon: "2",
    },
    {
      title: "批量录入餐食",
      desc: "按出勤名单一键录入，并支持过敏拦截",
      href: "/diet",
      icon: "3",
    },
    {
      title: "成长观察",
      desc: "记录行为、情绪、睡眠并标记复查",
      href: "/growth",
      icon: "4",
    },
    {
      title: "家园共育",
      desc: "家长打卡并提交已知晓/配合/今晚反馈",
      href: "/parent",
      icon: "5",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-white p-7 shadow-sm lg:flex-row lg:items-center lg:justify-between">
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
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink href="/health" title="晨检与健康" description="记录每日体温、情绪、手口眼" />
          <QuickLink href="/diet" title="批量录入与例外处理" description="支持过敏拦截、手动排除、单个调整" />
          <QuickLink href="/parent" title="家长反馈时间线" description="已知晓 / 在家已配合 / 今晚反馈" />
        </div>
      </div>
      
      {abnormalHealthChecks.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 shadow-sm animate-in fade-in">
          <div className="flex-shrink-0 mt-0.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
              ⚠️
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-800">健康晨检告警 ({abnormalHealthChecks.length}人)</h3>
            <p className="mt-1 text-sm text-red-700">
              存在晨检异常（如体温偏高、情绪哭闹或手口眼异常），请及时关注并通知家长。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {abnormalHealthChecks.map(r => {
                const child = visibleChildren.find(c => c.id === r.childId);
                if (!child) return null;
                return (
                  <Badge key={r.id} variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-200">
                    {child.name} ({r.temperature}°C, {r.mood}, {r.handMouthEye})
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {missingHealthChecks.length > 0 && currentUser.role !== "家长" && presentCount > 0 && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-start gap-3 shadow-sm">
          <div className="flex-shrink-0 mt-0.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              📋
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-orange-800">晨检待完善</h3>
            <p className="mt-1 text-sm text-orange-700">
              今日出勤 {presentCount} 人，尚有 {missingHealthChecks.length} 人未完成晨检记录。
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="border-orange-200 text-orange-700 hover:bg-orange-100">
            <Link href="/health">前往登记</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="可见幼儿" value={`${visibleChildren.length}`} desc={`${currentUser.role}权限范围`} icon={<Users className="h-5 w-5 text-indigo-500" />} />
        <StatCard title="今日出勤" value={`${presentCount}`} desc={visibleChildren.length ? `出勤率 ${Math.round((presentCount / visibleChildren.length) * 100)}%` : "暂无数据"} icon={<TrendingUp className="h-5 w-5 text-emerald-500" />} />
        <StatCard title="今日饮食记录" value={`${todayMeals.length}`} desc="含早餐/午餐/晚餐/加餐" icon={<Salad className="h-5 w-5 text-amber-500" />} />
        <StatCard title="规则建议" value={`${insights.length}`} desc="按年龄段、过敏、连续异常生成" icon={<Sparkles className="h-5 w-5 text-rose-500" />} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>业务闭环流程</CardTitle>
          <CardDescription>比赛演示可按此顺序操作，逻辑完整且可解释。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {flowSteps.map((step) => (
            <Link key={step.title} href={step.href} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
              <p className="text-lg font-bold text-indigo-500">{step.icon}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{step.desc}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>最近一周趋势</CardTitle>
            <CardDescription>规则引擎用于识别膳食均衡、蔬果不足、单一摄入和低饮水风险。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { label: "膳食均衡占比", value: weeklyTrend.balancedRate, suffix: "%", color: "bg-indigo-400" },
              { label: "含蔬果天数", value: weeklyTrend.vegetableDays, suffix: "天", color: "bg-emerald-400" },
              { label: "平均饮水量", value: weeklyTrend.hydrationAvg, suffix: "ml", color: "bg-sky-400" },
              { label: "饮食单一天数", value: weeklyTrend.monotonyDays, suffix: "天", color: "bg-rose-400" },
            ].map((item) => {
              const percent = item.suffix === "%" ? item.value : Math.min(item.value * 14, 100);
              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">{item.label}</span>
                    <span className="font-semibold text-slate-800">
                      {item.value}
                      {item.suffix}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              权限模型
            </CardTitle>
            <CardDescription>已按角色做可见范围控制，可继续接入 Supabase Auth + RLS。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <RoleItem role="家长" desc="仅看自己孩子，支持反馈动作。" />
            <RoleItem role="教师" desc="管理班级出勤、饮食、成长记录。" />
            <RoleItem role="机构管理员" desc="看全机构趋势与高频关注名单。" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookHeart className="h-5 w-5 text-rose-500" />
              机构管理员看板
            </CardTitle>
            <CardDescription>高频关注、低饮水、蔬果不足趋势。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BoardList title="高频关注儿童" icon={<AlertIcon />} items={adminBoard.highAttentionChildren.map((item) => `${item.childName}（${item.count}次）`)} emptyText="暂无" />
            <BoardList title="低饮水提醒" icon={<TrendingDown className="h-4 w-4 text-sky-400" />} items={adminBoard.lowHydrationChildren.map((item) => `${item.childName}（${item.hydrationAvg}ml）`)} emptyText="暂无" />
            <BoardList title="蔬果不足趋势" icon={<TrendingDown className="h-4 w-4 text-emerald-400" />} items={adminBoard.lowVegTrendChildren.map((item) => `${item.childName}（${item.vegetableDays}天）`)} emptyText="暂无" />
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
            <div className="flex items-end justify-between rounded-2xl bg-amber-50 p-4">
              <div>
                <p className="text-xs text-amber-600">待复查事项</p>
                <p className="mt-2 text-3xl font-bold text-amber-700">{pendingReviews.length}</p>
              </div>
              <Link href="/growth">
                <Button size="sm" variant="outline">进入复查台账</Button>
              </Link>
            </div>
            {pendingReviews.slice(0, 4).map((record) => {
              const child = visibleChildren.find((item) => item.id === record.childId);
              return (
                <div key={record.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="warning">{record.category}</Badge>
                    <span className="text-xs text-slate-400">{record.reviewDate ?? "待安排"}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{child?.name ?? "幼儿"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{record.followUpAction ?? record.description}</p>
                </div>
              );
            })}
            {pendingReviews.length === 0 ? <p className="text-sm text-slate-400">当前暂无待复查事项。</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-emerald-500" />
              批量模板入口
            </CardTitle>
            <CardDescription>用于演示“模板化录入 + 例外处理 + 过敏拦截”的效率优势。</CardDescription>
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                  <Badge variant={item.type === "feedback" ? "info" : item.type === "absence" ? "warning" : "secondary"}>
                    {item.type === "feedback" ? "反馈" : item.type === "absence" ? "缺勤" : item.type === "meal" ? "饮食" : "出勤"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                <p className="mt-2 text-[11px] text-slate-400">{item.dateTime}</p>
              </div>
            ))}
            {recentTimeline.length === 0 ? <p className="text-sm text-slate-400">今日时间线尚未生成。</p> : null}
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

function StatCard({ title, value, desc, icon }: { title: string; value: string; desc: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold text-slate-800">{value}</p>
        <p className="mt-2 text-xs text-slate-500">{desc}</p>
      </CardContent>
    </Card>
  );
}

function RoleItem({ role, desc }: { role: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="font-semibold text-slate-700">{role}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
    </div>
  );
}

function BoardList({ title, items, emptyText, icon }: { title: string; items: string[]; emptyText: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
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
