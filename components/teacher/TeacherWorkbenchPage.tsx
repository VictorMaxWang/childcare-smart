"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  HeartPulse,
  MessageSquareText,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
  Utensils,
  UsersRound,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import {
  AssistantEntryCard,
  InlineLinkButton,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import {
  TeacherActionTile,
  TeacherContextStrip,
  TeacherMiniPanel,
  TeacherTaskRow,
} from "@/components/teacher/TeacherOperationKit";
import { buildTeacherHomeViewModel } from "@/lib/view-models/role-home";
import { useApp } from "@/lib/store";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

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
          title="当前教师账号还没有班级可见数据"
          description="请先使用示例教师账号，或为普通教师账号关联班级与儿童。"
        />
      </div>
    );
  }

  const teacherStats = [
    { label: "当前班级", value: currentUser.className ?? "当前班级", tone: "indigo" as const },
    { label: "班级幼儿", value: `${visibleChildren.length} 人`, tone: "sky" as const },
    { label: "今日出勤", value: `${presentChildren.length} 人`, tone: "emerald" as const },
    {
      label: "待处理",
      value: `${viewModel.todayAbnormalChildren.length + viewModel.uncheckedMorningChecks.length + viewModel.pendingReviews.length} 项`,
      tone: viewModel.todayAbnormalChildren.length > 0 ? ("rose" as const) : ("amber" as const),
    },
  ];

  return (
    <RolePageShell
      badge={`教师工作台 · ${currentUser.className ?? "当前班级"} · ${TODAY_TEXT}`}
      title="今日班级运营"
      description="班级状态、晨检补录、复查跟进和家园沟通集中在一页处理，优先露出老师每天最常用的入口。"
      actions={
        <>
          <InlineLinkButton href="/teacher/high-risk-consultation" label="发起高风险会诊" variant="premium" />
          <InlineLinkButton href="/teacher/agent?action=communication" label="生成家园沟通建议" variant="premium" />
          <InlineLinkButton href="/teacher/health-file-bridge" label="健康材料解析" />
        </>
      }
    >
      <RoleSplitLayout
        main={
          <div className="flex flex-col gap-6">
            <TeacherContextStrip items={teacherStats} />

            <SectionCard title="今日优先处理" description="异常、未检和复查对象会按当前班级数据自动收拢。">
              <div className="grid gap-4 xl:grid-cols-3">
                <TeacherMiniPanel
                  title="晨检异常"
                  badge={`${viewModel.todayAbnormalChildren.length} 人`}
                  tone={viewModel.todayAbnormalChildren.length > 0 ? "rose" : "slate"}
                >
                  <div className="space-y-3">
                    {viewModel.todayAbnormalChildren.length > 0 ? (
                      viewModel.todayAbnormalChildren.map((item) => (
                        <TeacherTaskRow
                          key={item.record.id}
                          title={item.child.name}
                          meta={item.child.className}
                          detail={`体温 ${item.record.temperature}°C · ${item.record.mood} · ${item.record.handMouthEye}`}
                          status="需优先处理"
                          statusVariant="danger"
                          tone="rose"
                        />
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-slate-500">今日暂未发现异常晨检儿童。</p>
                    )}
                  </div>
                </TeacherMiniPanel>

                <TeacherMiniPanel
                  title="待晨检"
                  badge={`${viewModel.uncheckedMorningChecks.length} 人`}
                  tone={viewModel.uncheckedMorningChecks.length > 0 ? "amber" : "slate"}
                >
                  <div className="space-y-3">
                    {viewModel.uncheckedMorningChecks.length > 0 ? (
                      viewModel.uncheckedMorningChecks.map((child) => (
                        <TeacherTaskRow
                          key={child.id}
                          title={child.name}
                          meta={child.className}
                          detail="今日已出勤，晨检记录尚未补齐。"
                          status="待晨检"
                          statusVariant="warning"
                          tone="amber"
                        />
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-slate-500">今日出勤儿童都已完成晨检。</p>
                    )}
                  </div>
                </TeacherMiniPanel>

                <TeacherMiniPanel
                  title="待复查"
                  badge={`${viewModel.pendingReviews.length} 项`}
                  tone={viewModel.pendingReviews.length > 0 ? "sky" : "slate"}
                >
                  <div className="space-y-3">
                    {viewModel.pendingReviews.length > 0 ? (
                      viewModel.pendingReviews.map((item) => (
                        <TeacherTaskRow
                          key={item.record.id}
                          title={item.child.name}
                          meta={`${item.child.className} · ${item.record.category}`}
                          detail={item.record.followUpAction ?? item.record.description}
                          status="待复查"
                          statusVariant="info"
                          tone="sky"
                        />
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-slate-500">当前没有待复查名单。</p>
                    )}
                  </div>
                </TeacherMiniPanel>
              </div>
            </SectionCard>

            <SectionCard title="高频操作入口" description="晨检、饮食、成长、AI 和健康材料处理保持直达。">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <TeacherActionTile
                  href="/teacher/high-risk-consultation"
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title="高风险会诊"
                  description="带入晨检、复查、观察和反馈，生成园内动作与家庭任务。"
                  tone="rose"
                  highlight
                />
                <TeacherActionTile
                  href="/health"
                  icon={<HeartPulse className="h-5 w-5" />}
                  title="晨检录入"
                  description="查看待检、正常、异常状态，补齐体温、情绪和手口眼记录。"
                  tone="sky"
                />
                <TeacherActionTile
                  href="/diet"
                  icon={<Utensils className="h-5 w-5" />}
                  title="饮食记录"
                  description="批量录入餐次，再对个别幼儿做饮水、过敏和进餐状态调整。"
                  tone="emerald"
                />
                <TeacherActionTile
                  href="/growth"
                  icon={<BookOpenCheck className="h-5 w-5" />}
                  title="成长观察"
                  description="补充观察标签、复查日期和后续动作，形成可追踪时间线。"
                  tone="indigo"
                />
                <TeacherActionTile
                  href="/teacher/agent?action=communication"
                  icon={<MessageSquareText className="h-5 w-5" />}
                  title="家园沟通"
                  description="根据当前儿童状态生成家长沟通建议和后续提醒。"
                  tone="amber"
                />
                <TeacherActionTile
                  href="/teacher/health-file-bridge"
                  icon={<FileText className="h-5 w-5" />}
                  title="健康材料解析"
                  description="整理外部图片或 PDF 材料中的事实、风险和复查提示。"
                  tone="slate"
                />
              </div>
            </SectionCard>

            <SectionCard title="今日家园沟通" description="把需要今天同步的对象放在记录区旁边。">
              <div className="grid gap-3 lg:grid-cols-2">
                {viewModel.parentsToCommunicate.length > 0 ? (
                  viewModel.parentsToCommunicate.map((item) => (
                    <TeacherTaskRow
                      key={item.child.id}
                      title={item.child.name}
                      meta={item.child.className}
                      detail={item.reason}
                      status="建议沟通"
                      statusVariant="info"
                      tone="indigo"
                    />
                  ))
                ) : (
                  <TeacherMiniPanel title="沟通状态" badge="稳定" tone="emerald">
                    <p className="text-sm leading-6 text-slate-600">当前没有必须立即沟通的家长对象。</p>
                  </TeacherMiniPanel>
                )}
                <TeacherMiniPanel title="沟通建议预览" badge="AI 助手" tone="indigo">
                  <div className="flex items-start gap-3">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    <p className="text-sm leading-7 text-slate-600">{viewModel.communicationPreview}</p>
                  </div>
                </TeacherMiniPanel>
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <div className="space-y-6">
            <UnifiedIntentEntryCard
              roleHint="teacher"
              sourcePage="/teacher"
              title="一句话定位教师工作"
              placeholder="例如：帮我看看今天最需要优先处理的孩子，或生成本周周报"
              examples={[
                "帮我看看今天最需要优先处理的孩子",
                "生成本周周报",
                "开始一次会诊",
              ]}
              compact
            />

            <AssistantEntryCard
              title="教师 AI 助手"
              description="按当前班级上下文生成家长沟通、今日跟进和本周总结。"
              href="/teacher/agent"
              buttonLabel="进入教师 AI 助手"
            >
              <TeacherMiniPanel title="当前上下文" badge={currentUser.className ?? "当前班级"} tone="sky">
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  <li>异常晨检：{viewModel.todayAbnormalChildren.length} 人</li>
                  <li>待复查：{viewModel.pendingReviews.length} 项</li>
                  <li>待沟通：{viewModel.parentsToCommunicate.length} 人</li>
                </ul>
              </TeacherMiniPanel>
            </AssistantEntryCard>

            <AssistantEntryCard
              title="高风险儿童会诊"
              description="围绕儿童长期画像、最近状态和当前补充信息输出可执行卡片。"
              href="/teacher/high-risk-consultation"
              buttonLabel="发起高风险会诊"
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-sky-500" />
                  晨检异常和复查记录自动带入
                </li>
                <li className="flex items-center gap-3">
                  <PencilLine className="h-4 w-4 text-emerald-500" />
                  教师补充、图片占位和语音速记保持原流程
                </li>
                <li className="flex items-center gap-3">
                  <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                  会诊结果同步到教师、家长和园长视角
                </li>
              </ul>
            </AssistantEntryCard>

            <SectionCard title="今日处理顺序" description="移动端进入后先看这三项。">
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  先处理异常儿童
                </li>
                <li className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-sky-500" />
                  补齐未完成晨检
                </li>
                <li className="flex items-center gap-3">
                  <BrainCircuit className="h-4 w-4 text-indigo-500" />
                  生成家园沟通建议
                </li>
              </ol>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
