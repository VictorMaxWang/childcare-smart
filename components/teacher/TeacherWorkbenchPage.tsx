"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CloudSun,
  FileText,
  HeartPulse,
  MessageSquareText,
  PencilLine,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Utensils,
  UsersRound,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import {
  ReplicaBarChart,
  ReplicaComboChart,
  ReplicaDonutChart,
  ReplicaLineChart,
  replicaChartColors,
  type ReplicaChartDatum,
  type ReplicaDonutDatum,
} from "@/components/charts";
import {
  PixelMetricCard,
  PixelPanel,
  PixelQuickLink,
  PixelSectionTitle,
  PixelTaskRow,
  PixelTextButton,
} from "@/components/teacher/TeacherPixelReplicaPrimitives";
import { buildTeacherHomeViewModel } from "@/lib/view-models/role-home";
import { useApp } from "@/lib/store";

const DESIGN_DATE = "4月26日 星期五";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(value: string) {
  return value.slice(0, 10);
}

function addDays(key: string, days: number) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function lastDateKey(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

type WorkbenchTask = {
  title: string;
  detail: string;
  status: string;
  tone: "red" | "blue" | "amber" | "violet" | "green";
  checked?: boolean;
  href?: string;
  disabled?: boolean;
};

type PriorityChild = {
  name: string;
  note: string;
  tags: string[];
  time: string;
  avatar: string;
};

type TimelineItem = {
  time: string;
  title: string;
  value: string;
  image: string;
  tone: "violet" | "green" | "red" | "blue" | "amber";
};

export default function TeacherWorkbenchPage() {
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    attendanceRecords,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    tasks,
    messages,
  } = useApp();
  const viewModel = buildTeacherHomeViewModel({
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
  });

  if (visibleChildren.length === 0) {
    return (
      <div className="app-page">
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="当前教师账号还没有班级可见数据"
          description="请先使用示例教师账号，或为普通教师账号关联班级与儿童。"
        />
      </div>
    );
  }

  const className = currentUser.className ?? "小一班";
  const visualClassSize = visibleChildren.length;
  const visualAttendance = presentChildren.length;
  const absentCount = Math.max(visualClassSize - visualAttendance, 0);
  const attendanceRate = visualClassSize > 0 ? `${Math.round((visualAttendance / visualClassSize) * 100)}%` : "0%";
  const abnormalCount = viewModel.todayAbnormalChildren.length;
  const waitingMessages = viewModel.parentsToCommunicate.length;
  const pendingMorningChecks = viewModel.uncheckedMorningChecks.length;
  const pendingReviews = viewModel.pendingReviews.length;
  const pendingRecords = pendingReviews + pendingMorningChecks + abnormalCount;
  const classChildIds = new Set(visibleChildren.map((child) => child.id));
  const teacherReferenceDate = lastDateKey([
    ...attendanceRecords.filter((record) => classChildIds.has(record.childId)).map((record) => dateKey(record.date)),
    ...healthCheckRecords.filter((record) => classChildIds.has(record.childId)).map((record) => dateKey(record.date)),
    ...mealRecords.filter((record) => classChildIds.has(record.childId)).map((record) => dateKey(record.date)),
    ...growthRecords.filter((record) => classChildIds.has(record.childId)).map((record) => dateKey(record.createdAt)),
  ]);
  const recentDateKeys = Array.from({ length: 7 }, (_, index) => addDays(teacherReferenceDate, index - 6));
  const recentDateSet = new Set(recentDateKeys);
  const todayMealChildIds = new Set(
    mealRecords
      .filter((record) => classChildIds.has(record.childId) && dateKey(record.date) === teacherReferenceDate)
      .map((record) => record.childId)
  );
  const todayMealCompletionRate =
    visualClassSize > 0 ? Math.round((todayMealChildIds.size / visualClassSize) * 100) : 0;
  const recentGrowthCount = growthRecords.filter(
    (record) => classChildIds.has(record.childId) && recentDateSet.has(dateKey(record.createdAt))
  ).length;
  const recentParentMessageCount = messages.filter(
    (message) =>
      classChildIds.has(message.childId) &&
      recentDateSet.has(dateKey(message.createdAt)) &&
      (message.senderRole === "parent" || message.receiverRole === "parent" || message.targetRole === "parent")
  ).length;
  const teacherAssignments = tasks.filter((task) => classChildIds.has(task.childId) && task.ownerRole === "teacher");
  const activeTeacherAssignments = teacherAssignments.filter((task) => task.status !== "completed");
  const teacherTrendRows: ReplicaChartDatum[] = recentDateKeys.map((date) => {
    const attendanceCount = attendanceRecords.filter(
      (record) => classChildIds.has(record.childId) && dateKey(record.date) === date && record.isPresent
    ).length;
    const healthAbnormal = healthCheckRecords.filter(
      (record) => classChildIds.has(record.childId) && dateKey(record.date) === date && record.isAbnormal
    ).length;
    const mealChildCount = new Set(
      mealRecords
        .filter((record) => classChildIds.has(record.childId) && dateKey(record.date) === date)
        .map((record) => record.childId)
    ).size;
    const growthCount = growthRecords.filter(
      (record) => classChildIds.has(record.childId) && dateKey(record.createdAt) === date
    ).length;
    const communicationCount = messages.filter(
      (message) => classChildIds.has(message.childId) && dateKey(message.createdAt) === date
    ).length;

    return {
      label: date.slice(5),
      attendance: attendanceCount,
      health: healthAbnormal,
      meal: visualClassSize > 0 ? Math.round((mealChildCount / visualClassSize) * 100) : 0,
      growth: growthCount,
      communication: communicationCount,
    };
  });
  const teacherRiskRows: ReplicaDonutDatum[] = [
    { label: "晨检异常", value: abnormalCount, color: replicaChartColors.red },
    { label: "成长复核", value: pendingReviews, color: replicaChartColors.amber },
    { label: "家长沟通", value: waitingMessages, color: replicaChartColors.sky },
    { label: "派单待办", value: activeTeacherAssignments.length, color: replicaChartColors.primary },
  ];
  const desktopTasks: WorkbenchTask[] = [
    {
      title: "晨检登记",
      detail: pendingMorningChecks > 0 ? `${pendingMorningChecks}名在园儿童待完成晨检` : "今日晨检已完成",
      status: pendingMorningChecks > 0 ? "待处理" : "已完成",
      tone: pendingMorningChecks > 0 ? "red" : "green",
      href: "/health",
      checked: pendingMorningChecks === 0,
    },
    {
      title: "饮食记录",
      detail: "进入饮食页补充今日餐点情况",
      status: "去记录",
      tone: "blue",
      href: "/diet",
    },
    {
      title: "成长记录",
      detail: pendingReviews > 0 ? `${pendingReviews}条成长观察待复查` : "记录幼儿日常表现或精彩瞬间",
      status: pendingReviews > 0 ? "待复查" : "去记录",
      tone: "amber",
      href: "/growth",
    },
    {
      title: "家园沟通",
      detail: waitingMessages > 0 ? `${waitingMessages}位家长待沟通` : "当前暂无待沟通家长",
      status: waitingMessages > 0 ? "待回复" : "已清空",
      tone: "violet",
      href: "/teacher/agent?action=communication",
      checked: waitingMessages === 0,
    },
    {
      title: "消毒记录",
      detail: "当前版本暂未开放教师端消毒记录入口",
      status: "暂未开放",
      tone: "green",
      disabled: true,
    },
  ];
  const highPriorityChildren: PriorityChild[] = [
    ...viewModel.todayAbnormalChildren.map((item) => ({
      name: item.child.name,
      note: `体温 ${item.record.temperature}℃ · ${item.record.mood} · ${item.record.handMouthEye}`,
      tags: ["晨检异常"],
      time: item.record.date,
      avatar: item.child.gender === "女" ? "👧🏻" : "👦🏻",
    })),
    ...viewModel.pendingReviews.map((item) => ({
      name: item.child.name,
      note: item.record.followUpAction ?? item.record.description,
      tags: [item.record.category],
      time: item.record.reviewDate ?? "待复查",
      avatar: item.child.gender === "女" ? "👧🏻" : "👦🏻",
    })),
    ...viewModel.parentsToCommunicate.map((item) => ({
      name: item.child.name,
      note: item.reason,
      tags: ["家园沟通"],
      time: "待沟通",
      avatar: item.child.gender === "女" ? "👧🏻" : "👦🏻",
    })),
  ].slice(0, 5);
  const teacherSummaryRows: ReplicaChartDatum[] = [
    { label: "班级人数", value: visualClassSize },
    { label: "今日出勤", value: visualAttendance },
    { label: "待处理事项", value: pendingRecords + activeTeacherAssignments.length },
    { label: "晨检异常", value: abnormalCount },
    { label: "饮食完成率", value: todayMealCompletionRate },
    { label: "成长记录", value: recentGrowthCount },
    { label: "高风险儿童", value: highPriorityChildren.length },
    { label: "家长沟通", value: recentParentMessageCount },
  ];
  const completedMorningChecks = Math.max(visualAttendance - pendingMorningChecks, 0);
  const timelineItems: TimelineItem[] = [
    { time: "08:00", title: "入园签到", value: `${visualAttendance}人已签到`, image: "✓", tone: "violet" },
    { time: "08:30", title: "晨检完成", value: `${completedMorningChecks}人完成`, image: "✓", tone: "green" },
    { time: "09:00", title: "早操活动", value: visualAttendance > 0 ? `${visualAttendance}人可参与` : "暂无出勤", image: "🏃", tone: "red" },
    { time: "10:30", title: "区域活动", value: pendingReviews > 0 ? `${pendingReviews}项需观察` : "暂无待复查", image: "🧩", tone: "blue" },
    { time: "11:00", title: "午餐记录", value: "进入饮食页记录", image: "🍱", tone: "amber" },
    { time: "13:00", title: "午睡观察", value: abnormalCount > 0 ? `${abnormalCount}人需关注` : "暂无异常", image: "🛏️", tone: "violet" },
  ];

  return (
    <div className="app-page max-w-[92rem] px-4 py-5 sm:px-6 lg:px-7">
      <DesktopWorkbench
        abnormalCount={abnormalCount}
        className={className}
        currentUserName={currentUser.name}
        desktopTasks={desktopTasks}
        highPriorityChildren={highPriorityChildren}
        pendingRecords={pendingRecords}
        pendingMorningChecks={pendingMorningChecks}
        teacherRiskRows={teacherRiskRows}
        teacherSummaryRows={teacherSummaryRows}
        teacherTrendRows={teacherTrendRows}
        todayMealCompletionRate={todayMealCompletionRate}
        timelineItems={timelineItems}
        visualAttendance={visualAttendance}
        visualClassSize={visualClassSize}
        waitingMessages={waitingMessages}
      />
      <MobileWorkbench
        abnormalCount={abnormalCount}
        className={className}
        currentUserName={currentUser.name}
        absentCount={absentCount}
        attendanceRate={attendanceRate}
        highPriorityChildren={highPriorityChildren}
        pendingRecords={pendingRecords}
        pendingMorningChecks={pendingMorningChecks}
        teacherRiskRows={teacherRiskRows}
        teacherSummaryRows={teacherSummaryRows}
        teacherTrendRows={teacherTrendRows}
        todayMealCompletionRate={todayMealCompletionRate}
        visualAttendance={visualAttendance}
        visualClassSize={visualClassSize}
        waitingMessages={waitingMessages}
      />
    </div>
  );
}

function DesktopWorkbench({
  abnormalCount,
  className,
  currentUserName,
  desktopTasks,
  highPriorityChildren,
  pendingRecords,
  pendingMorningChecks,
  teacherRiskRows,
  teacherSummaryRows,
  teacherTrendRows,
  todayMealCompletionRate,
  timelineItems,
  visualAttendance,
  visualClassSize,
  waitingMessages,
}: {
  abnormalCount: number;
  className: string;
  currentUserName: string;
  desktopTasks: WorkbenchTask[];
  highPriorityChildren: PriorityChild[];
  pendingRecords: number;
  pendingMorningChecks: number;
  teacherRiskRows: ReplicaDonutDatum[];
  teacherSummaryRows: ReplicaChartDatum[];
  teacherTrendRows: ReplicaChartDatum[];
  todayMealCompletionRate: number;
  timelineItems: TimelineItem[];
  visualAttendance: number;
  visualClassSize: number;
  waitingMessages: number;
}) {
  const riskTips = [
    ...(abnormalCount > 0
      ? [["晨检异常提醒", `${abnormalCount}名儿童今日晨检异常`, "建议复测并同步家长。"]]
      : []),
    ...(pendingMorningChecks > 0
      ? [["晨检补录提醒", `${pendingMorningChecks}名在园儿童未完成晨检`, "请进入晨检页补齐记录。"]]
      : []),
    ...(waitingMessages > 0
      ? [["家园沟通提醒", `${waitingMessages}位家长待沟通`, "请进入家园沟通处理。"]]
      : []),
  ];

  return (
    <div className="hidden space-y-3.5 lg:block">
      <PixelPanel className="p-3.5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[1.7rem] font-bold leading-tight text-[#16213f]">早上好，{currentUserName} 👋</h1>
            <p className="mt-2 text-sm font-semibold text-[#667391]">{className} · {visualClassSize}名幼儿</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#7b85a1]">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              用心陪伴，科学养育，让成长看得见。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <div className="inline-flex h-12 items-center gap-2 rounded-[0.9rem] border border-[#e3e9f5] bg-white px-4 text-sm font-semibold text-[#51607f]">
              <CalendarDays className="h-4 w-4" />
              今日 {DESIGN_DATE}
            </div>
            <div className="inline-flex h-12 items-center gap-2 rounded-[0.9rem] border border-[#e3e9f5] bg-white px-4 text-sm font-semibold text-[#51607f]">
              <CloudSun className="h-5 w-5 text-amber-400" />
              27°C 多云　空气优
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[1.1rem] border border-[#e4ebf7] bg-white/82 p-3.5">
          <PixelSectionTitle title="班级概览" />
          <div className="mt-3 grid gap-4 xl:grid-cols-4">
            <PixelMetricCard label="在园人数" value={`${visualAttendance}人`} subLabel={`应到 ${visualClassSize}人`} tone="violet" icon={<UsersRound className="h-6 w-6" />} />
            <PixelMetricCard label="待处理记录" value={`${pendingRecords}条`} subLabel="晨检/饮食/成长" tone="blue" icon={<ClipboardCheck className="h-6 w-6" />} />
            <PixelMetricCard label="异常儿童" value={`${abnormalCount}人`} subLabel="需关注" tone="orange" icon={<AlertTriangle className="h-6 w-6" />} />
            <PixelMetricCard label="未回复家长消息" value={`${waitingMessages}条`} subLabel="真实待沟通" tone="green" icon={<MessageSquareText className="h-6 w-6" />} />
          </div>
        </div>
      </PixelPanel>

      <TeacherChartsOverview
        riskRows={teacherRiskRows}
        summaryRows={teacherSummaryRows}
        trendRows={teacherTrendRows}
        todayMealCompletionRate={todayMealCompletionRate}
      />

      <div className="grid gap-3.5 xl:grid-cols-[0.95fr_1.28fr_0.9fr]">
        <PixelPanel className="p-3.5">
          <PixelSectionTitle
            title="今日待办"
            meta={`${pendingRecords + waitingMessages}项待办`}
            action={<PixelTextButton href="/teacher/agent?action=weekly-summary">查看全部</PixelTextButton>}
          />
          <div className="mt-3 rounded-[1rem] border border-[#eef2f8] px-3">
            {desktopTasks.map((task) => (
              <PixelTaskRow key={task.title} {...task} />
            ))}
          </div>
          <Link href="/teacher/agent?action=weekly-summary" className="mt-3 block text-center text-xs font-bold text-violet-600">
            全部待办
          </Link>
        </PixelPanel>

        <PixelPanel className="p-3.5">
          <PixelSectionTitle title="快捷入口" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PixelQuickLink href="/health" icon={<Thermometer className="h-5 w-5" />} title="晨检登记" subtitle="快速录入" tone="violet" />
            <PixelQuickLink href="/diet" icon={<Utensils className="h-5 w-5" />} title="饮食记录" subtitle="拍照记录" tone="blue" />
            <PixelQuickLink href="/growth" icon={<BookOpenCheck className="h-5 w-5" />} title="成长记录" subtitle="亮点记录" tone="green" />
            <PixelQuickLink href="/teacher/agent?action=communication" icon={<MessageSquareText className="h-5 w-5" />} title="家园沟通" subtitle="联系家长" tone="orange" />
          </div>
        </PixelPanel>

        <PixelPanel className="p-3.5">
          <PixelSectionTitle
            title="高优先级儿童"
            meta={`${highPriorityChildren.length}人`}
            action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>}
          />
          <div className="mt-3 space-y-2.5">
            {highPriorityChildren.length > 0 ? highPriorityChildren.map((child) => (
              <Link
                key={`${child.name}-${child.time}-${child.tags.join("-")}-${child.note}`}
                href="/teacher/high-risk-consultation"
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[0.9rem] border border-rose-100 bg-rose-50/35 px-3 py-2.5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl shadow-sm">{child.avatar}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-[#172345]">{child.name}</span>
                    {child.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">{tag}</span>
                    ))}
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium text-[#7a86a4]">{child.note}</span>
                </span>
                <span className="text-xs font-semibold text-[#8290ad]">{child.time}</span>
              </Link>
            )) : (
              <div className="rounded-[0.9rem] border border-slate-100 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-[#7a86a4]">
                当前没有高优先级儿童
              </div>
            )}
          </div>
        </PixelPanel>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.55fr_0.72fr_0.58fr]">
        <PixelPanel className="p-4">
          <PixelSectionTitle title="今日班级动态" action={<PixelTextButton href="/teacher/agent">查看全部</PixelTextButton>} />
          <div className="mt-4 grid grid-cols-6 gap-2">
            {timelineItems.map((item) => (
              <div key={item.time} className="relative text-center">
                <div className="absolute left-1/2 top-[1.05rem] h-px w-full bg-[#d8e1f0] first:hidden" />
                <span className="relative mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-[#f7f9fd]">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.tone === "green" ? "bg-emerald-400" : item.tone === "red" ? "bg-rose-400" : item.tone === "blue" ? "bg-blue-400" : item.tone === "amber" ? "bg-amber-400" : "bg-violet-500"}`} />
                </span>
                <p className="mt-2 text-xs font-bold text-[#63708f]">{item.time}</p>
                <p className="mt-2 text-sm font-bold text-[#172345]">{item.title}</p>
                <p className="mt-1 text-xs font-medium text-[#7f8aa5]">{item.value}</p>
                <div className="mx-auto mt-2 flex h-14 w-[5.5rem] items-center justify-center rounded-[0.85rem] bg-[#f3f6fb] text-2xl shadow-inner">
                  {item.image}
                </div>
              </div>
            ))}
          </div>
        </PixelPanel>

        <PixelPanel className="p-4">
          <PixelSectionTitle title="风险提示" meta={`${riskTips.length}项需关注`} action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>} />
          <div className="mt-3 space-y-2.5">
            {riskTips.length > 0 ? riskTips.map(([title, detail, action]) => (
              <div key={title} className="rounded-[0.95rem] border border-rose-100 bg-rose-50/45 p-3.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-500" />
                  <div>
                    <p className="text-sm font-bold text-rose-600">{title}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-[#667391]">{detail}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-[#667391]">{action}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[0.95rem] border border-emerald-100 bg-emerald-50/45 p-3.5 text-sm font-semibold text-emerald-700">
                当前没有需要额外关注的风险提示
              </div>
            )}
          </div>
        </PixelPanel>

        <PixelPanel className="p-4">
          <PixelSectionTitle title="快速录入入口" meta="保证记录及时完整" />
          <div className="mt-3 space-y-2">
            <EntryButton href="/teacher/high-risk-consultation" icon={<ShieldAlert className="h-4 w-4" />} label="发起高风险会诊" tone="red" />
            <EntryButton href="/health" icon={<HeartPulse className="h-4 w-4" />} label="去晨检录入" tone="blue" />
            <EntryButton href="/growth" icon={<PencilLine className="h-4 w-4" />} label="去成长观察" tone="green" />
            <EntryButton href="/diet" icon={<Utensils className="h-4 w-4" />} label="去饮食录入" tone="orange" />
            <EntryButton href="/teacher/health-file-bridge" icon={<FileText className="h-4 w-4" />} label="外部健康文件上传" tone="violet" />
          </div>
        </PixelPanel>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-4">
        <BottomStat label="今日异常儿童" value={abnormalCount} tone="border-l-amber-400" />
        <BottomStat label="未完成晨检" value={pendingMorningChecks} tone="border-l-sky-400" />
        <BottomStat label="待处理记录" value={pendingRecords} tone="border-l-violet-400" />
        <BottomStat label="待沟通家长" value={waitingMessages} tone="border-l-emerald-400" />
      </div>
    </div>
  );
}

function MobileWorkbench({
  absentCount,
  abnormalCount,
  attendanceRate,
  className,
  currentUserName,
  highPriorityChildren,
  pendingRecords,
  pendingMorningChecks,
  teacherRiskRows,
  teacherSummaryRows,
  teacherTrendRows,
  todayMealCompletionRate,
  visualAttendance,
  visualClassSize,
  waitingMessages,
}: {
  absentCount: number;
  abnormalCount: number;
  attendanceRate: string;
  className: string;
  currentUserName: string;
  highPriorityChildren: PriorityChild[];
  pendingRecords: number;
  pendingMorningChecks: number;
  teacherRiskRows: ReplicaDonutDatum[];
  teacherSummaryRows: ReplicaChartDatum[];
  teacherTrendRows: ReplicaChartDatum[];
  todayMealCompletionRate: number;
  visualAttendance: number;
  visualClassSize: number;
  waitingMessages: number;
}) {
  const notificationCount = pendingRecords + waitingMessages;
  const mobileAlerts = [
    ...highPriorityChildren.slice(0, 3).map((child) => ({
      avatar: child.avatar,
      title: child.name,
      tag: child.tags[0] ?? "关注",
      detail: child.note,
      meta: child.time,
      href: child.tags.includes("家园沟通") ? "/teacher/agent?action=communication" : "/teacher/high-risk-consultation",
    })),
    ...(pendingMorningChecks > 0
      ? [
          {
            avatar: "📋",
            title: "晨检未完成",
            tag: `${pendingMorningChecks}`,
            detail: `${pendingMorningChecks}名儿童未完成`,
            meta: "",
            href: "/health",
          },
        ]
      : []),
    ...(waitingMessages > 0
      ? [
          {
            avatar: "💬",
            title: "家园沟通未回复",
            tag: `${waitingMessages}`,
            detail: `${waitingMessages}位家长待沟通`,
            meta: "",
            href: "/teacher/agent?action=communication",
          },
        ]
      : []),
  ].slice(0, 5);

  return (
    <div className="space-y-5 lg:hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-blue-100 text-5xl shadow-[0_12px_30px_rgb(99_102_241_/_0.10)]">
            👩🏻
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight text-[#101a35]">{currentUserName}</h1>
            <p className="mt-2 text-base font-semibold text-[#6d7895]">早上好，专注每个孩子的健康成长 ☀️</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={waitingMessages > 0 ? "/teacher/agent?action=communication" : "/teacher/agent?action=weekly-summary"} className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[#dce5f4] bg-white">
            <Bell className="h-6 w-6 text-[#27324d]" />
            {notificationCount > 0 ? <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{notificationCount}</span> : null}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex h-20 items-center justify-between rounded-[1.2rem] border border-[#dfe7f4] bg-white px-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-[#53617f]" />
            <span className="text-xl font-bold text-[#172345]">{className}</span>
            <ChevronDown className="h-5 w-5 text-[#7785a2]" />
          </div>
          <span className="text-base font-semibold text-[#6d7895]">班级 <b className="text-violet-600">{visualClassSize}</b> 人</span>
        </div>
        <Link href="/children" className="flex h-20 items-center gap-2 rounded-[1.2rem] border border-[#dfe7f4] bg-white px-4 font-bold text-[#27324d] shadow-sm">
          <UsersRound className="h-6 w-6" />
          班级管理
        </Link>
      </div>

      <PixelPanel className="rounded-[1.45rem] p-6">
        <PixelSectionTitle title="今日概览" meta="更新于 08:30" />
        <div className="mt-6 grid grid-cols-4 gap-3 text-center">
          <MobileMetric icon={<CheckCircle2 className="h-6 w-6" />} value={visualAttendance} label="今日出勤" sub={attendanceRate} tone="green" />
          <MobileMetric icon={<UsersRound className="h-6 w-6" />} value={absentCount} label="今日缺勤" sub={visualClassSize > 0 ? `${Math.round((absentCount / visualClassSize) * 100)}%` : "0%"} tone="orange" />
          <MobileMetric icon={<HeartPulse className="h-6 w-6" />} value={abnormalCount} label="健康异常" sub="需关注" tone="red" />
          <MobileMetric icon={<ClipboardCheck className="h-6 w-6" />} value={pendingRecords} label="待完成任务" sub="查看" tone="violet" />
        </div>
      </PixelPanel>

      <TeacherChartsOverview
        riskRows={teacherRiskRows}
        summaryRows={teacherSummaryRows}
        trendRows={teacherTrendRows}
        todayMealCompletionRate={todayMealCompletionRate}
      />

      <PixelPanel className="rounded-[1.45rem] border-rose-100 bg-rose-50/35 p-5">
        <PixelSectionTitle
          title="紧急提醒"
          meta={<span className="rounded-full bg-red-500 px-2 py-0.5 text-white">{mobileAlerts.length}</span>}
          action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>}
        />
        <div className="mt-4 overflow-hidden rounded-[1rem] border border-rose-100 bg-white/78">
          {mobileAlerts.length > 0 ? mobileAlerts.map((item) => (
            <Link key={`${item.title}-${item.tag}-${item.meta}-${item.detail}`} href={item.href} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-rose-100/80 px-4 py-3 last:border-b-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl">{item.avatar}</span>
              <span>
                <span className="flex items-center gap-2">
                  <b className="text-lg text-[#172345]">{item.title}</b>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm font-bold text-red-500">{item.tag}</span>
                </span>
                <span className="mt-1 block text-sm font-medium text-[#6d7895]">{item.detail}</span>
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#6d7895]">
                {item.meta}
                <ChevronRight className="h-5 w-5" />
              </span>
            </Link>
          )) : (
            <div className="px-4 py-8 text-center text-sm font-semibold text-[#7a86a4]">当前没有紧急提醒</div>
          )}
        </div>
      </PixelPanel>

      <PixelPanel className="rounded-[1.45rem] p-5">
        <PixelSectionTitle title="快速入口" action={<button type="button" disabled className="text-sm font-bold text-slate-400">自定义暂未开放</button>} />
        <div className="mt-5 grid grid-cols-3 gap-4">
          <MobileQuick href="/health" icon={<Thermometer className="h-9 w-9" />} title="晨检" subtitle="体温 · 异常 · 缺勤" tone="violet" />
          <MobileQuick href="/diet" icon={<Utensils className="h-9 w-9" />} title="饮食记录" subtitle="膳食 · 过敏 · 喂养" tone="green" />
          <MobileQuick href="/growth" icon={<BookOpenCheck className="h-9 w-9" />} title="成长记录" subtitle="发展 · 表现 · 照片" tone="amber" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <MobileQuick href="/teacher/agent?action=communication" icon={<MessageSquareText className="h-10 w-10" />} title="家园沟通" subtitle={`通知 · 反馈 · 消息 ${waitingMessages}`} tone="blue" wide />
          <MobileQuick href="/teacher/health-file-bridge" icon={<ShieldAlert className="h-10 w-10" />} title="健康材料解析" subtitle={`文档解析 · 风险预警 ${pendingRecords}`} tone="violet" wide />
        </div>
      </PixelPanel>

      <div className="h-8" />
    </div>
  );
}

function TeacherChartsOverview({
  riskRows,
  summaryRows,
  trendRows,
  todayMealCompletionRate,
}: {
  riskRows: ReplicaDonutDatum[];
  summaryRows: ReplicaChartDatum[];
  trendRows: ReplicaChartDatum[];
  todayMealCompletionRate: number;
}) {
  return (
    <div data-testid="r03-teacher-chart-suite" className="grid gap-3.5 xl:grid-cols-[1.18fr_0.82fr]">
      <PixelPanel className="p-4">
        <PixelSectionTitle title="班级 7 天趋势" meta={`饮食完成率 ${todayMealCompletionRate}%`} />
        <div className="mt-4">
          <ReplicaLineChart
            data={trendRows}
            testId="r03-teacher-trend-chart"
            series={[
              { key: "attendance", label: "今日出勤", color: replicaChartColors.primary, unit: "人" },
              { key: "health", label: "晨检异常", color: replicaChartColors.red, unit: "项" },
              { key: "meal", label: "饮食完成率", color: replicaChartColors.amber, unit: "%" },
              { key: "growth", label: "成长记录", color: replicaChartColors.green, unit: "条" },
              { key: "communication", label: "家长沟通", color: replicaChartColors.sky, unit: "条" },
            ]}
          />
        </div>
      </PixelPanel>
      <PixelPanel className="p-4">
        <PixelSectionTitle title="班级关键指标" meta="真实班级数据" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.72fr)]">
          <ReplicaBarChart
            data={summaryRows}
            testId="r03-teacher-summary-bars"
            series={[{ key: "value", label: "数量", color: replicaChartColors.primary }]}
            height={205}
          />
          <ReplicaDonutChart
            data={riskRows}
            testId="r03-teacher-risk-donut"
            totalLabel="待关注"
            unit="项"
            height={205}
          />
        </div>
      </PixelPanel>
      <PixelPanel className="p-4 xl:col-span-2">
        <PixelSectionTitle title="记录完成与家园沟通" meta="饮食 / 成长 / 反馈 / 派单" />
        <div className="mt-4">
          <ReplicaComboChart
            data={summaryRows.filter((row) => ["饮食完成率", "成长记录", "高风险儿童", "家长沟通"].includes(row.label))}
            testId="r03-teacher-operations-combo"
            series={[{ key: "value", label: "真实值", color: replicaChartColors.cyan, kind: "bar" }]}
            height={200}
          />
        </div>
      </PixelPanel>
    </div>
  );
}

function EntryButton({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  tone: "red" | "blue" | "green" | "orange" | "violet";
}) {
  const toneClass = {
    red: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return (
    <Link href={href} className="flex h-9 items-center gap-2 rounded-[0.65rem] bg-[#f4f6ff] px-3 text-xs font-bold text-[#4d5a78]">
      <span className={toneClass}>{icon}</span>
      {label}
    </Link>
  );
}

function BottomStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-[0.85rem] border border-[#e3e9f5] border-l-4 bg-white px-5 py-4 shadow-sm ${tone}`}>
      <span className="text-xs font-semibold text-[#7b86a1]">{label}</span>
      <span className="ml-8 text-xl font-bold text-[#172345]">{value}</span>
    </div>
  );
}

function MobileMetric({
  icon,
  value,
  label,
  sub,
  tone,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  sub: string;
  tone: "green" | "orange" | "red" | "violet";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-500",
    red: "bg-rose-50 text-rose-500",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return (
    <div>
      <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${toneClass}`}>{icon}</span>
      <p className="mt-3 text-4xl font-bold leading-none text-[#111b34]">{value}</p>
      <p className="mt-3 text-sm font-semibold text-[#667391]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#7c88a6]">{sub}</p>
    </div>
  );
}

function MobileQuick({
  href,
  icon,
  title,
  subtitle,
  tone,
  wide = false,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: "violet" | "green" | "amber" | "blue";
  wide?: boolean;
}) {
  const toneClass = {
    violet: "border-violet-100 bg-violet-50/40 text-violet-600",
    green: "border-emerald-100 bg-emerald-50/45 text-emerald-600",
    amber: "border-amber-100 bg-amber-50/45 text-amber-500",
    blue: "border-blue-100 bg-blue-50/45 text-blue-600",
  }[tone];
  return (
    <Link
      href={href}
      className={`flex min-h-[8.75rem] flex-col items-center justify-center rounded-[1.05rem] border text-center shadow-sm ${toneClass} ${wide ? "min-h-[8.5rem]" : ""}`}
    >
      {icon}
      <p className="mt-3 text-xl font-bold text-[#172345]">{title}</p>
      <p className="mt-2 text-sm font-semibold text-[#7c88a6]">{subtitle}</p>
    </Link>
  );
}
