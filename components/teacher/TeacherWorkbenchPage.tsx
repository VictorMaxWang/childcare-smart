"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  FileText,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import {
  AssistantEntryCard,
  InlineLinkButton,
  MetricGrid,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildTeacherHomeViewModel } from "@/lib/view-models/role-home";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

function WorkbenchSignalCard({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "alert" | "focus";
  className?: string;
}) {
  const toneMap = {
    neutral: "border-white/14 bg-[linear-gradient(180deg,rgba(13,17,39,0.9),rgba(9,12,27,0.82))]",
    alert: "border-violet-300/18 bg-[linear-gradient(180deg,rgba(26,18,56,0.94),rgba(14,11,35,0.86))]",
    focus: "border-indigo-300/18 bg-[linear-gradient(180deg,rgba(18,20,52,0.94),rgba(10,11,30,0.84))]",
  } as const;

  return (
    <Card
      surface={tone === "neutral" ? "glass" : "luminous"}
      glow={tone === "focus" ? "brand" : "soft"}
      interactive={false}
      className={cn("overflow-hidden", toneMap[tone], className)}
    >
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function QuickEntryTile({
  href,
  icon: Icon,
  label,
  iconClassName,
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  iconClassName: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card
        surface={primary ? "luminous" : "glass"}
        glow={primary ? "brand" : "soft"}
        className={cn(
          "h-full border-white/14",
          primary
            ? "bg-[linear-gradient(160deg,rgba(25,18,54,0.94),rgba(13,12,34,0.9),rgba(15,18,42,0.88))]"
            : "bg-[linear-gradient(180deg,rgba(13,17,39,0.88),rgba(9,12,27,0.8))]"
        )}
      >
        <CardContent className="flex h-full flex-col justify-between gap-6 p-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 shadow-[var(--shadow-card)]">
            <Icon className={cn("h-5 w-5", iconClassName)} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="mt-2 text-xs leading-5 text-white/52">{primary ? "优先主路径" : "快捷进入录入"}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

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
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="当前教师账号还没有班级可见数据。"
          description="请先使用示例教师账号，或为普通教师账号关联班级与儿童。"
        />
      </div>
    );
  }

  const teacherHeroAside = (
    <div className="space-y-3">
      <div className="hero-note-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{currentUser.className ?? "当前班级"}</Badge>
          <Badge variant={viewModel.todayAbnormalChildren.length > 0 ? "warning" : "success"}>
            {viewModel.todayAbnormalChildren.length > 0 ? "异常优先" : "节奏稳定"}
          </Badge>
        </div>
        <p className="mt-4 text-base font-semibold text-slate-950">
          录屏时第一屏先讲清今天该先处理哪类儿童，再进入晨检、复查和家长沟通。
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{viewModel.communicationPreview}</p>
      </div>
      <MetricGrid
        items={viewModel.heroStats.map((item, index) => ({
          ...item,
          tone:
            index === 0
              ? "violet"
              : index === 1
                ? "aurora"
                : index === 2
                  ? "cobalt"
                  : "lavender",
        }))}
        className="sm:grid-cols-2"
      />
    </div>
  );

  return (
    <RolePageShell
      intensity="light"
      badge={`教师工作台 · ${currentUser.className ?? "当前班级"} · ${TODAY_TEXT}`}
      title="先处理今天最紧急的儿童，再把晨检、复查与家长沟通走顺。"
      description="教师工作台优先保证任务扫描效率。首屏只聚焦今日异常、核心 KPI 与主操作入口，后两层再承载待晨检、待复查与家长沟通。"
      actions={
        <>
          <InlineLinkButton href="/teacher/high-risk-consultation" label="发起高风险会诊" variant="premium" />
          <InlineLinkButton href="/teacher/agent" label="进入教师 AI 助手" variant="premium" />
          <InlineLinkButton href="/teacher/agent?action=communication" label="生成家长沟通建议" />
        </>
      }
      heroAside={teacherHeroAside}
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.96fr)]">
              <SectionCard
                title="今日异常儿童"
                description="首屏第一优先级，只展示今天最需要老师先处理的异常晨检对象。"
                surface="luminous"
                glow="brand"
              >
                <div className="space-y-3">
                  {viewModel.todayAbnormalChildren.length > 0 ? (
                    viewModel.todayAbnormalChildren.map((item) => (
                      <WorkbenchSignalCard key={item.record.id} tone="alert">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.child.name}</p>
                          <Badge variant="info">需优先处理</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          体温 {item.record.temperature}°C · {item.record.mood} · {item.record.handMouthEye}
                        </p>
                      </WorkbenchSignalCard>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">今日暂未发现异常晨检儿童。</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="快捷录入入口"
                description="把今日主链路压成一个直接可点的入口区，避免老师来回找页面。"
                surface="glass"
                glow="soft"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <QuickEntryTile
                    href="/teacher/high-risk-consultation"
                    icon={ShieldAlert}
                    label="发起高风险会诊"
                    iconClassName="text-violet-100"
                    primary
                  />
                  <QuickEntryTile href="/health" icon={ShieldCheck} label="去晨检录入" iconClassName="text-indigo-200" />
                  <QuickEntryTile href="/growth" icon={BookOpenCheck} label="去成长观察" iconClassName="text-violet-200" />
                  <QuickEntryTile href="/diet" icon={PencilLine} label="去饮食录入" iconClassName="text-violet-200" />
                  <QuickEntryTile
                    href="/teacher/health-file-bridge"
                    icon={FileText}
                    label="外部健康文件桥接"
                    iconClassName="text-indigo-100"
                  />
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="待晨检儿童"
                description="先补齐基础记录，后续 AI 建议和沟通动作才有可靠依据。"
                surface="solid"
                glow="soft"
              >
                <div className="space-y-3">
                  {viewModel.uncheckedMorningChecks.length > 0 ? (
                    viewModel.uncheckedMorningChecks.map((child) => (
                      <WorkbenchSignalCard key={child.id}>
                        <p className="text-sm font-semibold text-slate-900">{child.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{child.className} · 今日待晨检</p>
                      </WorkbenchSignalCard>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">今日在园儿童都已完成晨检。</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="待复查名单"
                description="把需要持续跟踪的儿童压成一列，避免被其他任务淹没。"
                surface="solid"
                glow="soft"
              >
                <div className="space-y-3">
                  {viewModel.pendingReviews.length > 0 ? (
                    viewModel.pendingReviews.map((item) => (
                      <WorkbenchSignalCard key={item.record.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.child.name}</p>
                          <Badge variant="secondary">{item.record.category}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {item.record.followUpAction ?? item.record.description}
                        </p>
                      </WorkbenchSignalCard>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">当前没有待复查名单。</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="今日待沟通家长"
              description="第三层保留需要同步的家长对象，便于老师迅速确定今天该联系谁。"
              surface="solid"
              glow="soft"
            >
              <div className="space-y-3">
                {viewModel.parentsToCommunicate.length > 0 ? (
                  viewModel.parentsToCommunicate.map((item) => (
                    <WorkbenchSignalCard key={item.child.id} tone="focus">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{item.child.name}</p>
                        <Badge variant="info">建议沟通</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                    </WorkbenchSignalCard>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-500">当前没有必须立刻沟通的家长对象。</p>
                )}
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <div className="space-y-6 xl:sticky xl:top-5">
            <UnifiedIntentEntryCard
              roleHint="teacher"
              sourcePage="/teacher"
              title="一句话直达老师 AI 助手"
              placeholder="例如：帮我看今天最该优先处理的孩子，或生成家长沟通建议"
              examples={["今天最该优先处理谁", "生成家长沟通建议", "开始一次高风险会诊"]}
              compact
              initiallyCollapsed
              collapsedSummary="需要时再展开：优先级判断、沟通建议和会诊入口都在这里。"
            />

            <AssistantEntryCard
              title="高风险儿童一键会诊"
              description="适合录屏展示的主路径，自动带入晨检异常、待复查、近 7 天观察与家长反馈。"
              href="/teacher/high-risk-consultation"
              buttonLabel="发起高风险会诊"
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li>适用场景：晨检异常、反复待复查、家长反馈提示持续风险。</li>
                <li>输出闭环：老师动作、家庭任务和园长优先级决策。</li>
                <li>更适合录屏演示“今天先做什么”的主线。</li>
              </ul>
            </AssistantEntryCard>

            <AssistantEntryCard
              title="进入教师 AI 助手"
              description="进入后直接看到班级上下文、异常摘要和可一键生成的沟通建议。"
              href="/teacher/agent"
              buttonLabel="进入教师 AI 助手"
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li>当前班级：{currentUser.className ?? "当前班级"}</li>
                <li>当前任务：异常处理、复查跟进与家长同步。</li>
                <li>推荐入口：家长沟通建议 / 今日跟进行动。</li>
              </ul>
            </AssistantEntryCard>

            <SectionCard
              title="老师今日顺序"
              description="移动端一进来先处理这三件事，不让首页失焦。"
              surface="glass"
              glow="soft"
            >
              <div className="space-y-3">
                <WorkbenchSignalCard>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <AlertTriangle className="h-4 w-4 text-violet-200" />
                    先看异常儿童
                  </div>
                </WorkbenchSignalCard>
                <WorkbenchSignalCard>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <ShieldCheck className="h-4 w-4 text-indigo-200" />
                    补齐待晨检与待复查
                  </div>
                </WorkbenchSignalCard>
                <WorkbenchSignalCard>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <BrainCircuit className="h-4 w-4 text-violet-200" />
                    再同步家长与生成建议
                  </div>
                </WorkbenchSignalCard>
              </div>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
