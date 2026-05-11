"use client";

import Image from "next/image";
import { useState } from "react";
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
import { RoleAssistantWorkspace } from "@/components/ai";
import type { AdminAgentActionItem, AdminAgentResult, AdminDispatchEvent } from "@/lib/agent/admin-types";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import {
  directorReplicaAssets,
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
  const recommendedOwners = result?.recommendedOwnerMap ?? [];
  const [questionText, setQuestionText] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const trimmedQuestion = questionText.trim();
  const dispatchableActionItems = actionItems.filter((item) => !item.relatedEventId && !isCreatingNotification(item.id));
  const closureValues = [
    scope?.riskChildrenCount ?? 0,
    actionItems.length,
    scope?.pendingDispatchCount ?? 0,
    scope?.pendingReviewCount ?? 0,
  ];

  function handleSubmitQuestion() {
    if (!trimmedQuestion || loading) return;
    onQuestion(trimmedQuestion);
    setQuestionText("");
  }

  function handleBatchDispatch() {
    if (!dispatchAvailable || dispatchableActionItems.length === 0) return;
    dispatchableActionItems.slice(0, 4).forEach((item) => onCreateDispatch(item));
  }

  return (
    <DirectorReplicaPage
      eyebrow={`园长 AI 助手 · ${institutionName}`}
      title="从识别问题，到生成动作，再到派单闭环"
      description="基于近 7 天数据分析，识别重点问题、生成建议动作、承接派单状态并保留周报入口。"
      actions={
        <>
          <ReplicaButton variant="outline" onClick={() => setShowHelp((value) => !value)} data-testid="r05-admin-agent-help">
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

      {showHelp ? (
        <ReplicaPanel title="使用说明" description="这些入口都连接真实园长端流程，不展示假成功状态。" bodyClassName="grid gap-3 sm:grid-cols-3">
          {[
            ["追问数据", "在 AI 工作台输入问题，调用 /api/ai/admin-agent 返回真实结果或明确 provider 状态。"],
            ["生成派单", "点击建议动作会写入通知派单，已有派单不会重复创建。"],
            ["周报闭环", "周报工作区支持生成、保存、导出、分享和归档。"],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-[14px] border border-[#E8ECF7] bg-[#F8FAFF] p-4">
              <p className="text-sm font-bold text-[#172554]">{title}</p>
              <p className="mt-2 text-xs leading-5 text-[#596681]">{detail}</p>
            </div>
          ))}
        </ReplicaPanel>
      ) : null}

      <RoleAssistantWorkspace
        roleLabel="园长端"
        title="AI 助手工作台"
        description="快捷问题、周报生成、风险儿童分析、派单建议、数据问答和运营报表统一展示在这里。"
        prompts={quickQuestions}
        value={questionText}
        onValueChange={setQuestionText}
        onSubmit={handleSubmitQuestion}
        onPromptClick={onQuestion}
        loading={loading}
        error={requestError}
        source={result?.source}
        model={result?.model}
        response={
          <p>
            {result?.assistantAnswer ??
              "园长可以直接追问全园风险、派单优先级、周报摘要和运营指标；provider 不可用时这里会显示明确状态。"}
          </p>
        }
        actionCards={
          <div className="space-y-3">
            <button type="button" className="w-full rounded-2xl border border-indigo-100 bg-white/90 p-3 text-left text-sm font-semibold text-indigo-700" onClick={onOpenWeekly}>
              周报生成
            </button>
            {actionItems.slice(0, 2).map((item) => (
              <button
                type="button"
                key={item.id}
                className="w-full rounded-2xl border border-slate-100 bg-white/90 p-3 text-left text-sm text-slate-700"
                onClick={() => onCreateDispatch(item)}
                disabled={!dispatchAvailable || isCreatingNotification(item.id) || Boolean(item.relatedEventId)}
              >
                <span className="block font-semibold text-slate-900">{item.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.ownerLabel} · {item.deadline}</span>
              </button>
            ))}
          </div>
        }
      />

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
                  <span className="mt-1 text-[26px] font-bold text-[#172554]">{actionItems.length}类</span>
                </div>
              </div>
            </ReplicaPanel>
            <ReplicaMetric
              label="AI 分析结论"
              value={`${result?.highlights.length ?? 0}项`}
              subValue="重点关注"
              icon={<Sparkles className="h-4 w-4" />}
              tone="purple"
            />
            <ReplicaMetric
              label="建议动作"
              value={`${actionItems.length}条`}
              subValue={`待派单 ${scope?.pendingDispatchCount ?? 0} 条`}
              icon={<ClipboardList className="h-4 w-4" />}
              tone="blue"
            />
            <ReplicaMetric
              label="闭环进度"
              value={`${scope?.pendingReviewCount ?? 0}项`}
              subValue="待复盘优化"
              icon={<ShieldCheck className="h-4 w-4" />}
              tone="green"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <ReplicaPanel
              title={`建议动作（${actionItems.length}）`}
              actions={
                <>
                  <ReplicaPill tone="purple">{`待派单任务（${scope?.pendingDispatchCount ?? 0}）`}</ReplicaPill>
                  <ReplicaPill tone="slate">{result?.source === "ai" ? "vivo Chat" : result?.source ?? "待生成"}</ReplicaPill>
                </>
              }
            >
              <div className="space-y-4">
                {actionItems.length > 0 ? (
                  actionItems.map((item) => (
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
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-5 text-sm text-[#7A86A6]">
                    当前没有 AI 生成的建议动作。可重新生成或输入自定义问题。
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-[#7A86A6]">共 {actionItems.length} 条</span>
                <ReplicaButton
                  variant="soft"
                  onClick={handleBatchDispatch}
                  disabled={!dispatchAvailable || dispatchableActionItems.length === 0}
                  data-testid="r05-admin-agent-batch-dispatch"
                >
                  批量派单
                </ReplicaButton>
              </div>
            </ReplicaPanel>

            <div className="space-y-5">
              <ReplicaPanel title={`待派单任务（${actionItems.length}）`} actions={<ReplicaPill tone={dispatchAvailable ? "green" : "orange"}>{dispatchAvailable ? "支持派单" : dispatchStatusMessage}</ReplicaPill>}>
                <div className="space-y-3">
                  {actionItems.length > 0 ? (
                    actionItems.slice(0, 4).map((item) => (
                      <div key={item.id} className="rounded-[14px] border border-[#E8ECF7] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-[#172554]">{item.title}</p>
                          <ReplicaPill tone={statusTone(item.status)}>{statusLabel(item.status)}</ReplicaPill>
                        </div>
                        <p className="mt-2 text-xs text-[#7A86A6]">{item.deadline}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[14px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                      暂无待派单任务。
                    </div>
                  )}
                </div>
              </ReplicaPanel>

              <RoleAssistantWorkspace
                roleLabel="园长端"
                title="AI 解释与对话"
                description="周报、风险儿童、派单建议、数据问答和运营报表都通过服务端 vivo Chat 生成。"
                prompts={quickQuestions}
                value={questionText}
                onValueChange={setQuestionText}
                onSubmit={handleSubmitQuestion}
                onPromptClick={onQuestion}
                loading={loading}
                error={requestError}
                source={result?.source}
                model={result?.model}
                response={
                  <p>
                    {result?.assistantAnswer ??
                      "以上建议会基于近 7 天健康、照护、家园沟通和派单数据生成；provider 不可用时会显示明确错误，不伪造成 AI 成功。"}
                  </p>
                }
                actionCards={
                  <div className="space-y-3">
                    {actionItems.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-indigo-100 bg-white/90 p-3 text-sm">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.ownerLabel} · {item.deadline}</p>
                      </div>
                    ))}
                  </div>
                }
              />

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
                  <input
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSubmitQuestion();
                    }}
                    disabled={loading}
                    placeholder="输入问题，如：饮水量低的原因有哪些？"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-[#E4E7F5] bg-white px-3 text-sm text-[#172554] outline-none transition focus:border-[#635BFF] disabled:bg-[#F5F7FB] disabled:text-[#9AA4BD]"
                  />
                  <ReplicaButton disabled={!trimmedQuestion || loading} onClick={handleSubmitQuestion}>
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
          <ReplicaPanel title={`已指派对象（${recommendedOwners.length}）`} actions={<ReplicaPill tone="blue">AI 推荐</ReplicaPill>}>
            <div className="space-y-3">
              {recommendedOwners.length > 0 ? (
                recommendedOwners.map((item) => (
                  <div key={`${item.ownerLabel}-${item.count}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF4FF] text-sm font-bold text-[#635BFF]">
                        {item.ownerLabel.slice(0, 1)}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#172554]">{item.ownerLabel}</p>
                        <p className="text-xs text-[#7A86A6]">{item.count} 项建议动作</p>
                      </div>
                    </div>
                    <ReplicaPill tone="blue">{item.count}项</ReplicaPill>
                  </div>
                ))
              ) : (
                <div className="rounded-[14px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                  暂无 AI 推荐指派对象。
                </div>
              )}
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
              {closureValues.map((value, index) => (
                <div key={`${index}-${value}`} className="rounded-[12px] bg-[#F8FAFF] px-2 py-3">
                  <p className="text-lg font-bold text-[#172554]">{value}</p>
                  <p className="mt-1 text-[11px] text-[#7A86A6]">{index === 3 ? "待复盘" : "真实计数"}</p>
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
                儿童数：{scope?.visibleChildren ?? 0} 人
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
