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

const desktopTasks = [
  { title: "晨检登记", detail: "请完成一批儿童晨检登记", status: "未完成", tone: "red" as const },
  { title: "饮食记录", detail: "记录今日上午点、午餐情况", status: "未完成", tone: "blue" as const },
  { title: "成长记录", detail: "记录幼儿日常表现或精彩瞬间", status: "进行中", tone: "amber" as const },
  { title: "家园沟通", detail: "7条家长消息待回复", status: "未完成", tone: "violet" as const },
  { title: "消毒记录", detail: "记录班级消毒情况", status: "已完成", tone: "green" as const, checked: true },
];

const timelineItems = [
  { time: "08:00", title: "入园签到", value: "19人已签到", image: "✓", tone: "violet" },
  { time: "08:30", title: "晨检完成", value: "19人完成", image: "✓", tone: "green" },
  { time: "09:00", title: "早操活动", value: "全员参与", image: "🏃", tone: "red" },
  { time: "10:30", title: "区域活动", value: "自主游戏中", image: "🧩", tone: "blue" },
  { time: "11:00", title: "午餐时间", value: "18人已用餐", image: "🍱", tone: "amber" },
  { time: "13:00", title: "午睡时间", value: "18人午睡中", image: "🛏️", tone: "violet" },
];

export default function TeacherWorkbenchPage() {
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
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
  const visualClassSize = Math.max(visibleChildren.length, className === "晨曦班" ? 28 : 21);
  const visualAttendance = Math.max(presentChildren.length, className === "晨曦班" ? 19 : 19);
  const abnormalCount = Math.max(viewModel.todayAbnormalChildren.length, 3);
  const waitingMessages = Math.max(viewModel.parentsToCommunicate.length, 7);
  const pendingRecords = Math.max(
    viewModel.pendingReviews.length + viewModel.uncheckedMorningChecks.length + viewModel.todayAbnormalChildren.length,
    18
  );
  const highPriorityChildren = [
    {
      name: viewModel.todayAbnormalChildren[0]?.child.name ?? "乐乐",
      note: viewModel.todayAbnormalChildren[0]
        ? `体温 ${viewModel.todayAbnormalChildren[0].record.temperature}℃`
        : "体温 37.9℃",
      tags: ["体温异常", "咳嗽"],
      time: "08:30 晨检",
      avatar: "👦🏻",
    },
    {
      name: viewModel.pendingReviews[0]?.child.name ?? "小然",
      note: viewModel.pendingReviews[0]?.record.category ?? "今日午餐食量较少",
      tags: ["食欲不佳"],
      time: "11:10 饮食记录",
      avatar: "👧🏻",
    },
    {
      name: viewModel.parentsToCommunicate[0]?.child.name ?? "豆豆",
      note: viewModel.parentsToCommunicate[0]?.reason ?? "入园时有哭闹",
      tags: ["情绪波动"],
      time: "今日需重点关注",
      avatar: "👦",
    },
  ];

  return (
    <div className="app-page max-w-[92rem] px-4 py-5 sm:px-6 lg:px-7">
      <DesktopWorkbench
        abnormalCount={abnormalCount}
        className={className}
        currentUserName={currentUser.name}
        highPriorityChildren={highPriorityChildren}
        pendingRecords={pendingRecords}
        visualAttendance={visualAttendance}
        visualClassSize={visualClassSize}
        waitingMessages={waitingMessages}
      />
      <MobileWorkbench
        abnormalCount={abnormalCount}
        className={className}
        currentUserName={currentUser.name}
        pendingRecords={pendingRecords}
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
  highPriorityChildren,
  pendingRecords,
  visualAttendance,
  visualClassSize,
  waitingMessages,
}: {
  abnormalCount: number;
  className: string;
  currentUserName: string;
  highPriorityChildren: Array<{ name: string; note: string; tags: string[]; time: string; avatar: string }>;
  pendingRecords: number;
  visualAttendance: number;
  visualClassSize: number;
  waitingMessages: number;
}) {
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
            <PixelMetricCard label="未回复家长消息" value={`${waitingMessages}条`} subLabel="较昨日 +3" tone="green" icon={<MessageSquareText className="h-6 w-6" />} />
          </div>
        </div>
      </PixelPanel>

      <div className="grid gap-3.5 xl:grid-cols-[0.95fr_1.28fr_0.9fr]">
        <PixelPanel className="p-3.5">
          <PixelSectionTitle
            title="今日待办"
            meta="14项待办"
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
            meta={`${abnormalCount}人`}
            action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>}
          />
          <div className="mt-3 space-y-2.5">
            {highPriorityChildren.map((child) => (
              <Link
                key={child.name}
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
            ))}
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
          <PixelSectionTitle title="风险提示" meta="2项需关注" action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>} />
          <div className="mt-3 space-y-2.5">
            {[
              ["天气变化提醒", "未来24小时降温明显，注意增减衣物", "建议加强晨检，预防呼吸道感染"],
              ["卫生消毒提醒", "本周消毒记录有2项未完成", "请及时补充消毒记录"],
            ].map(([title, detail, action]) => (
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
            ))}
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
        <BottomStat label="未完成晨检" value={2} tone="border-l-sky-400" />
        <BottomStat label="待处理记录" value={pendingRecords} tone="border-l-violet-400" />
        <BottomStat label="待沟通家长" value={waitingMessages} tone="border-l-emerald-400" />
      </div>
    </div>
  );
}

function MobileWorkbench({
  abnormalCount,
  className,
  currentUserName,
  pendingRecords,
  visualAttendance,
  visualClassSize,
  waitingMessages,
}: {
  abnormalCount: number;
  className: string;
  currentUserName: string;
  pendingRecords: number;
  visualAttendance: number;
  visualClassSize: number;
  waitingMessages: number;
}) {
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
          <button type="button" className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[#dce5f4] bg-white">
            <Bell className="h-6 w-6 text-[#27324d]" />
            <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">3</span>
          </button>
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
          <MobileMetric icon={<CheckCircle2 className="h-6 w-6" />} value={visualAttendance} label="今日出勤" sub="77.8%" tone="green" />
          <MobileMetric icon={<UsersRound className="h-6 w-6" />} value={8} label="今日缺勤" sub="22.2%" tone="orange" />
          <MobileMetric icon={<HeartPulse className="h-6 w-6" />} value={Math.max(abnormalCount, 5)} label="健康异常" sub="需关注" tone="red" />
          <MobileMetric icon={<ClipboardCheck className="h-6 w-6" />} value={0} label="待完成任务" sub="查看" tone="violet" />
        </div>
      </PixelPanel>

      <PixelPanel className="rounded-[1.45rem] border-rose-100 bg-rose-50/35 p-5">
        <PixelSectionTitle
          title="紧急提醒"
          meta={<span className="rounded-full bg-red-500 px-2 py-0.5 text-white">5</span>}
          action={<PixelTextButton href="/teacher/high-risk-consultation">查看全部</PixelTextButton>}
        />
        <div className="mt-4 overflow-hidden rounded-[1rem] border border-rose-100 bg-white/78">
          {[
            ["👦🏻", "乐乐", "发热", "体温 38.2°C", "08:20 晨检"],
            ["👧🏻", "果果", "过敏", "牛奶 · 坚果", "饮食需关注"],
            ["📋", "晨检未完成", "3", "3名儿童未完成", ""],
            ["💬", "家园沟通未回复", "2", "2条新消息", ""],
            ["🏥", "健康材料待解析", "1", "更新于今日", ""],
          ].map(([avatar, title, tag, detail, meta]) => (
            <Link key={title} href={title.includes("沟通") ? "/teacher/agent?action=communication" : title.includes("材料") ? "/teacher/health-file-bridge" : "/teacher/high-risk-consultation"} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-rose-100/80 px-4 py-3 last:border-b-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl">{avatar}</span>
              <span>
                <span className="flex items-center gap-2">
                  <b className="text-lg text-[#172345]">{title}</b>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm font-bold text-red-500">{tag}</span>
                </span>
                <span className="mt-1 block text-sm font-medium text-[#6d7895]">{detail}</span>
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#6d7895]">
                {meta}
                <ChevronRight className="h-5 w-5" />
              </span>
            </Link>
          ))}
        </div>
      </PixelPanel>

      <PixelPanel className="rounded-[1.45rem] p-5">
        <PixelSectionTitle title="快速入口" action={<span className="text-sm font-bold text-violet-600">自定义 ✎</span>} />
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
