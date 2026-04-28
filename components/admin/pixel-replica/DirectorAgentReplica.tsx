"use client";

import Image from "next/image";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  FileText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { AdminAgentActionItem, AdminAgentResult, AdminDispatchEvent } from "@/lib/agent/admin-types";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import {
  assignedObjects,
  directorReplicaAssets,
  weeklyPendingRows,
} from "./directorReplicaData";
import {
  DirectorReplicaPage,
  ReplicaButton,
  ReplicaMetric,
  ReplicaPanel,
  ReplicaPill,
} from "./DirectorReplicaPrimitives";

function statusLabel(status: AdminDispatchEvent["status"] | AdminAgentActionItem["status"]) {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "进行中";
  if (status === "created") return "已接单";
  return "待派单";
}

function statusTone(status: AdminDispatchEvent["status"] | AdminAgentActionItem["status"]) {
  if (status === "completed") return "green" as const;
  if (status === "in_progress" || status === "created") return "blue" as const;
  return "orange" as const;
}

export default function DirectorAgentReplica({
  institutionName,
  result,
  quickQuestions,
  loading,
  requestError,
  dispatchAvailable,
  dispatchStatusMessage,
  notificationEvents,
  consultationPriorityItems,
  onRerun,
  onOpenWeekly,
  onQuestion,
  onCreateDispatch,
  onUpdateEventStatus,
  onCreateConsultationNotification,
  isCreatingNotification,
  isCreatingConsultationNotification,
  updatingEventId,
}: {
  institutionName: string;
  result: AdminAgentResult | null;
  quickQuestions: string[];
  loading: boolean;
  requestError: string | null;
  dispatchAvailable: boolean;
  dispatchStatusMessage: string;
  notificationEvents: AdminDispatchEvent[];
  consultationPriorityItems: AdminConsultationPriorityItem[];
  onRerun: () => void;
  onOpenWeekly: () => void;
  onQuestion: (question: string) => void;
  onCreateDispatch: (actionItem: AdminAgentActionItem) => void;
  onUpdateEventStatus: (eventId: string, status: AdminDispatchEvent["status"]) => void;
  onCreateConsultationNotification: (item: AdminConsultationPriorityItem) => void;
  isCreatingNotification: (actionItemId: string) => boolean;
  isCreatingConsultationNotification: (itemId: string) => boolean;
  updatingEventId: string | null;
}) {
  const scope = result?.institutionScope;
  const actionItems = result?.actionItems ?? [];
  return (
    <DirectorReplicaPage
      eyebrow={`园长 AI 助手 · ${institutionName}`}
      title="从识别问题，到生成动作，再到派单闭环"
      description="基于近 7 天数据分析，识别重点问题、生成建议动作、承接派单状态并保留周报入口。"
      actions={
        <>
          <ReplicaButton variant="outline">
            <CircleHelp className="h-4 w-4" />
            使用说明
          </ReplicaButton>
          <ReplicaButton variant="outline" onClick={onOpenWeekly}>
            <FileText className="h-4 w-4" />
            周报工作区
          </ReplicaButton>
          <ReplicaButton onClick={onRerun} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新生成
          </ReplicaButton>
        </>
      }
    >
      {requestError ? (
        <div className="rounded-[16px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {requestError}
          </span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <ReplicaPanel className="lg:col-span-1" bodyClassName="flex min-h-[304px] items-center justify-center p-5">
              <div className="relative h-[152px] w-[152px]">
                <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#EDF1FA" strokeWidth="7" />
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#4F8DF7" strokeWidth="7" strokeDasharray="34 66" strokeDashoffset="-25" />
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#54C7B2" strokeWidth="7" strokeDasharray="33 67" strokeDashoffset="-59" />
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#8B5CF6" strokeWidth="7" strokeDasharray="33 67" strokeDashoffset="-92" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-semibold text-[#7A86A6]">机构问题</span>
                  <span className="mt-1 text-[26px] font-bold text-[#172554]">{Math.max(actionItems.length, 3)}类</span>
                </div>
              </div>
            </ReplicaPanel>
            <ReplicaMetric
              label="AI 分析结论"
              value={`${Math.max(result?.highlights.length ?? 2, 2)}项`}
              subValue="重点关注"
              delta="较上周持平"
              icon={<Sparkles className="h-4 w-4" />}
              tone="purple"
            />
            <ReplicaMetric
              label="建议动作"
              value={`${Math.max(actionItems.length, 6)}条`}
              subValue={`待审核 ${Math.max(actionItems.length - 2, 2)} 条`}
              icon={<ClipboardList className="h-4 w-4" />}
              tone="blue"
            />
            <ReplicaMetric
              label="闭环进度"
              value="60%"
              subValue="本周完成度"
              delta="较上周 ↑15%"
              icon={<ShieldCheck className="h-4 w-4" />}
              tone="green"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <ReplicaPanel
              title="建议动作（6）"
              actions={
                <>
                  <ReplicaPill tone="purple">待派单任务（4）</ReplicaPill>
                  <ReplicaPill tone="slate">我发起的任务（8）</ReplicaPill>
                </>
              }
            >
              <div className="space-y-4">
                {actionItems.length > 0
                  ? actionItems.map((item) => (
                      <article key={item.id} className="rounded-[16px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                        <div className="flex gap-4">
                          <ReplicaPill tone={item.priorityLevel === "P1" ? "red" : item.priorityLevel === "P2" ? "orange" : "green"}>
                            {item.priorityLevel} {item.priorityLevel === "P1" ? "优先" : "较高"}
                          </ReplicaPill>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h2 className="font-bold text-[#172554]">{item.title}</h2>
                                <p className="mt-2 text-sm leading-6 text-[#596681]">{item.summary}</p>
                              </div>
                              <ReplicaPill tone={statusTone(item.status)}>{statusLabel(item.status)}</ReplicaPill>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#7A86A6]">
                              <span>负责人：{item.ownerLabel}</span>
                              <span>截止：{item.deadline}</span>
                              <span>对象：{item.targetName}</span>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <ReplicaPill tone="blue">{item.targetType === "child" ? "健康卫生" : "日常照护"}</ReplicaPill>
                              <ReplicaButton
                                variant="soft"
                                disabled={!dispatchAvailable || isCreatingNotification(item.id) || Boolean(item.relatedEventId)}
                                onClick={() => onCreateDispatch(item)}
                              >
                                {isCreatingNotification(item.id) ? "派单中..." : item.relatedEventId ? "已创建派单" : "生成派单"}
                              </ReplicaButton>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))
                  : weeklyPendingRows.map((row, index) => (
                      <article key={row.title} className="rounded-[16px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                        <div className="flex gap-4">
                          <ReplicaPill tone={index === 0 ? "red" : "orange"}>{index === 0 ? "P1 优先" : "P2 较高"}</ReplicaPill>
                          <div className="min-w-0 flex-1">
                            <h2 className="font-bold text-[#172554]">{row.title}</h2>
                            <p className="mt-2 text-sm leading-6 text-[#596681]">
                              {index === 0 ? "连续饮水量低于标准，建议调整饮水计划与督导策略。" : "根据本周数据生成的视觉占位建议，等待 AI 返回真实结构化结果。"}
                            </p>
                            <div className="mt-4 flex items-center justify-between">
                              <ReplicaPill tone={index === 0 ? "blue" : "purple"}>{row.tag}</ReplicaPill>
                              <ReplicaButton variant="soft" disabled>
                                等待 AI 结果
                              </ReplicaButton>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-[#7A86A6]">共 {Math.max(actionItems.length, 6)} 条</span>
                <ReplicaButton disabled variant="soft">
                  批量派单（视觉占位）
                </ReplicaButton>
              </div>
            </ReplicaPanel>

            <div className="space-y-5">
              <ReplicaPanel title="待派单任务（4）" actions={<ReplicaPill tone={dispatchAvailable ? "green" : "orange"}>{dispatchAvailable ? "支持派单" : dispatchStatusMessage}</ReplicaPill>}>
                <div className="space-y-3">
                  {(actionItems.length ? actionItems.slice(0, 4) : weeklyPendingRows).map((item) => {
                    const isAction = "ownerLabel" in item;
                    return (
                      <div key={isAction ? item.id : item.title} className="rounded-[14px] border border-[#E8ECF7] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-[#172554]">{isAction ? item.title : item.title}</p>
                          <ReplicaPill tone={isAction ? statusTone(item.status) : "orange"}>
                            {isAction ? statusLabel(item.status) : item.status}
                          </ReplicaPill>
                        </div>
                        <p className="mt-2 text-xs text-[#7A86A6]">{isAction ? item.deadline : item.deadline}</p>
                      </div>
                    );
                  })}
                </div>
              </ReplicaPanel>

              <ReplicaPanel title="AI 解释与对话">
                <div className="rounded-[15px] bg-[#F7F8FF] p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEEFFF] text-sm font-bold text-[#635BFF]">
                      AI
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-6 text-[#596681]">
                        {loading
                          ? "正在生成近 7 天机构级判断结果..."
                          : result?.assistantAnswer ??
                            "以上建议基于近 7 天健康、日常照护和安全管理数据分析生成。"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="flex h-10 flex-1 items-center rounded-xl border border-[#E4E7F5] bg-white px-3 text-sm text-[#9AA4BD]">
                    输入问题，如：饮水量低的原因有哪些？
                  </div>
                  <ReplicaButton disabled>
                    <Send className="h-4 w-4" />
                    发送
                  </ReplicaButton>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {quickQuestions.slice(0, 4).map((question) => (
                    <ReplicaButton key={question} variant="outline" onClick={() => onQuestion(question)} disabled={loading}>
                      {question}
                    </ReplicaButton>
                  ))}
                </div>
              </ReplicaPanel>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <ReplicaPanel title="已指派对象（6）" actions={<ReplicaPill tone="blue">查看全部</ReplicaPill>}>
            <div className="space-y-3">
              {assignedObjects.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF4FF] text-sm font-bold text-[#635BFF]">
                      {item.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#172554]">{item.name}</p>
                      <p className="text-xs text-[#7A86A6]">{item.role}</p>
                    </div>
                  </div>
                  <ReplicaPill tone={item.status === "待反馈" ? "orange" : "green"}>{item.status}</ReplicaPill>
                </div>
              ))}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="闭环追踪（本周）" actions={<ReplicaPill tone="purple">查看详情</ReplicaPill>}>
            <div className="relative pb-2 pt-3">
              <div className="absolute left-8 right-8 top-7 h-1 rounded-full bg-[#E6EAFA]" />
              <div className="relative grid grid-cols-4 gap-2 text-center">
                {["识别", "动作", "派单", "复盘"].map((step, index) => (
                  <div key={step} className="flex flex-col items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${index < 2 ? "bg-[#635BFF]" : "bg-[#B8C0DD]"}`}>
                      {index + 1}
                    </span>
                    <span className="text-xs text-[#7A86A6]">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {["12", "4", "2", "1.8天"].map((value, index) => (
                <div key={value} className="rounded-[12px] bg-[#F8FAFF] px-2 py-3">
                  <p className="text-lg font-bold text-[#172554]">{value}</p>
                  <p className="mt-1 text-[11px] text-[#7A86A6]">{index === 3 ? "平均" : "已完成"}</p>
                </div>
              ))}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="重点会诊 trace">
            <div className="space-y-3">
              {consultationPriorityItems.length > 0 ? (
                consultationPriorityItems.slice(0, 3).map((item) => (
                  <div key={item.consultationId} className="rounded-[14px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#172554]">
                          {item.decision.childName} · {item.decision.className}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[#596681]">{item.decision.whyHighPriority}</p>
                      </div>
                      <ReplicaPill tone={item.decision.priorityLabel === "P1" ? "red" : "orange"}>
                        {item.decision.priorityLabel}
                      </ReplicaPill>
                    </div>
                    <ReplicaButton
                      variant="soft"
                      className="mt-3 w-full"
                      disabled={!dispatchAvailable || isCreatingConsultationNotification(item.consultationId)}
                      onClick={() => onCreateConsultationNotification(item)}
                    >
                      {isCreatingConsultationNotification(item.consultationId) ? "派单中..." : "创建会诊派单"}
                    </ReplicaButton>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#7A86A6]">当前没有新的高优先级会诊 trace。</p>
              )}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="通知派单">
            <div className="space-y-3">
              {notificationEvents.length > 0 ? (
                notificationEvents.slice(0, 4).map((event) => (
                  <div key={event.id} className="rounded-[14px] border border-[#E8ECF7] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#172554]">{event.title}</p>
                        <p className="mt-2 text-xs leading-5 text-[#596681]">{event.summary}</p>
                      </div>
                      <ReplicaPill tone={statusTone(event.status)}>{statusLabel(event.status)}</ReplicaPill>
                    </div>
                    {dispatchAvailable ? (
                      <div className="mt-3 flex gap-2">
                        <ReplicaButton
                          variant="outline"
                          className="h-9 flex-1 px-2 text-xs"
                          disabled={updatingEventId === event.id || event.status === "in_progress"}
                          onClick={() => onUpdateEventStatus(event.id, "in_progress")}
                        >
                          处理中
                        </ReplicaButton>
                        <ReplicaButton
                          variant="soft"
                          className="h-9 flex-1 px-2 text-xs"
                          disabled={updatingEventId === event.id || event.status === "completed"}
                          onClick={() => onUpdateEventStatus(event.id, "completed")}
                        >
                          完成
                        </ReplicaButton>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                  暂无已创建派单。
                </div>
              )}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="数据范围">
            <div className="space-y-3 text-sm text-[#596681]">
              <p className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-[#635BFF]" />
                儿童数：{scope?.visibleChildren ?? 128} 人
              </p>
              <p className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#635BFF]" />
                数据时间：近 7 天
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#635BFF]" />
                数据来源：晨检 / 饮食 / 行为 / 家长反馈
              </p>
            </div>
            <Image
              src={directorReplicaAssets.aiDecoration}
              alt=""
              width={260}
              height={150}
              unoptimized
              className="mt-4 h-auto w-full rounded-[14px] object-cover"
            />
          </ReplicaPanel>
        </aside>
      </div>
    </DirectorReplicaPage>
  );
}
