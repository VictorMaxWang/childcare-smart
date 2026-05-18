"use client";

import { AlertCircle, Clock3, MessageSquareText, Target } from "lucide-react";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import TeacherCopilotPanel from "@/components/teacher/TeacherCopilotPanel";
import { Badge } from "@/components/ui/badge";
import { buildTeacherAgentTimeLabel, type TeacherAgentResult } from "@/lib/agent/teacher-agent";
import {
  hasTeacherResultAttentionSignal,
  normalizeTeacherCopilotFromResult,
} from "@/lib/teacher-copilot/normalize";
import type { TeacherCopilotSectionId } from "@/lib/teacher-copilot/types";

function getTeacherResultSourceLabel(source: string) {
  if (source === "ai" || source === "vivo") return "智能生成";
  if (source === "mock") return "演示结果";
  return "本地兜底";
}

function displayDiagnosticValue(value?: string | null) {
  return value?.trim() || "none";
}

function deriveKeyChildren(result: TeacherAgentResult) {
  if (result.keyChildren?.length) return result.keyChildren;
  if (result.mode === "child" && result.targetLabel.trim()) return [result.targetLabel];
  return ["班级重点儿童"];
}

function deriveReviewItems(result: TeacherAgentResult) {
  const candidates = [
    ...(result.reviewItems ?? []),
    result.tomorrowObservationPoint,
    result.interventionCard?.reviewIn48h,
    ...result.actionItems
      .filter((item) => /复查|48|离园|明天|明日|次日|反馈/.test(`${item.reason}${item.action}${item.timing}`))
      .map((item) => `${item.target}：${item.action}`),
  ];
  const seen = new Set<string>();
  const items: string[] = [];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
    if (items.length >= 5) break;
  }

  if (items.length > 0) return items;

  return [
    result.mode === "child"
      ? `${result.targetLabel}：明日入园后核对今天行动是否完成，并把结果补进成长记录。`
      : `${result.targetLabel}：离园前核对晨检异常、成长记录补录、家长反馈待回复和 48 小时复查。`,
  ];
}

function deriveParentMessage(result: TeacherAgentResult) {
  if (result.parentMessageDraft?.trim()) return result.parentMessageDraft;
  const firstAction = result.actionItems.find((item) => item.target.includes("家长")) ?? result.actionItems[0];
  return result.mode === "child"
    ? `请与${result.targetLabel}家长同步今日重点事件，并请家庭侧今晚反馈饮食、饮水、睡眠和情绪变化。${firstAction ? `本次重点：${firstAction.action}` : ""}`
    : `请与重点儿童家长同步本周观察结论，离园前收齐需要家庭配合的反馈。${firstAction ? `本次重点：${firstAction.action}` : ""}`;
}

export default function TeacherAgentResultCard({ result }: { result: TeacherAgentResult }) {
  const copilotPayload = normalizeTeacherCopilotFromResult(result);
  const keyChildren = deriveKeyChildren(result);
  const reviewItems = deriveReviewItems(result);
  const parentMessage = deriveParentMessage(result);
  let defaultOpenSection: TeacherCopilotSectionId | null = null;
  let sectionOrder: TeacherCopilotSectionId[] = [
    "parentCommunicationScript",
    "microTrainingSOP",
    "recordCompletionHints",
  ];

  if (result.workflow === "communication" && copilotPayload?.parentCommunicationScript) {
    defaultOpenSection = "parentCommunicationScript";
  } else if (
    result.workflow === "follow-up" &&
    copilotPayload?.microTrainingSOP &&
    hasTeacherResultAttentionSignal(result)
  ) {
    defaultOpenSection = "microTrainingSOP";
    sectionOrder = [
      "microTrainingSOP",
      "parentCommunicationScript",
      "recordCompletionHints",
    ];
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge variant={result.mode === "class" ? "info" : "warning"}>
          {result.mode === "class" ? "班级模式" : "单儿童模式"}
        </Badge>
        {result.consultationMode ? <Badge variant="warning">会诊模式</Badge> : null}
        <Badge variant="secondary">对象：{result.targetLabel}</Badge>
        <Badge variant={result.source === "ai" ? "success" : result.source === "mock" ? "info" : "secondary"}>
          生成方式：{getTeacherResultSourceLabel(result.source)}
        </Badge>
      </div>

      <div className="rounded-lg border border-slate-100 bg-white/90 p-4 text-xs text-slate-600">
        <p className="mb-3 text-sm font-semibold text-slate-900">可信字段</p>
        <div className="grid gap-2 md:grid-cols-2">
        <span><strong className="text-slate-900">provider</strong>: {displayDiagnosticValue(result.provider)}</span>
        <span><strong className="text-slate-900">transport</strong>: {displayDiagnosticValue(result.transport)}</span>
        <span><strong className="text-slate-900">fallbackReason</strong>: {displayDiagnosticValue(result.fallbackReason)}</span>
        <span><strong className="text-slate-900">dataQuality.source</strong>: {displayDiagnosticValue(result.dataQuality?.source)}</span>
        <span>
          <strong className="text-slate-900">fallback/mock</strong>:{" "}
          {result.dataQuality?.isFallback ? "fallback" : result.dataQuality?.isMock ? "mock" : "no"}
        </span>
        <span>
          <strong className="text-slate-900">inputs</strong>:{" "}
          {result.dataQuality
            ? `${result.dataQuality.inputCounts.visibleChildren}/${result.dataQuality.inputCounts.healthCheckRecords}/${result.dataQuality.inputCounts.mealRecords}/${result.dataQuality.inputCounts.growthRecords}/${result.dataQuality.inputCounts.guardianFeedbacks}`
            : "unknown"}
        </span>
        </div>
      </div>

      {result.dataQuality?.warnings?.length ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            <span>数据质量提示</span>
          </div>
          <p className="mt-2 leading-6">{result.dataQuality.warnings.join("、")}</p>
        </div>
      ) : null}

      <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
        <p className="text-sm font-semibold text-slate-900">摘要</p>
        <h3 className="text-lg font-semibold text-slate-900">{result.title}</h3>
        <p className="mt-2 text-sm leading-7 text-slate-700">{result.summary}</p>
      </div>

      {result.consultation ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">高风险会诊结论</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{result.consultation.summary}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{result.consultation.coordinatorSummary.finalConclusion}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.consultation.participants.map((item) => (
              <Badge key={item.id} variant={item.id === "coordinator" ? "warning" : "outline"}>
                {item.label}
              </Badge>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-white/70 bg-white/80 p-4">
            <p className="text-sm font-semibold text-slate-900">触发原因</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {result.consultation.triggerReasons.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {result.consultation.agentFindings.map((item) => (
              <div key={item.agentId} className="rounded-lg border border-white/70 bg-white/80 p-4">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.riskExplanation}</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {item.signals.slice(0, 3).map((signal) => (
                    <li key={signal}>- {signal}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-white/70 bg-white/80 p-4">
            <p className="text-sm font-semibold text-slate-900">园长决策卡</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{result.consultation.directorDecisionCard.reason}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
              <span>负责人：{result.consultation.directorDecisionCard.recommendedOwnerName}</span>
              <span>处理时间：{result.consultation.directorDecisionCard.recommendedAt}</span>
              <span>
                状态：
                {result.consultation.directorDecisionCard.status === "completed"
                  ? "已完成"
                  : result.consultation.directorDecisionCard.status === "in_progress"
                    ? "跟进中"
                    : "待分派"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {result.highlights.length > 0 ? (
        <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-900">关键点</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {result.highlights.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.highlights.length === 0 ? (
        <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-900">关键点</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            本次结果没有返回关键点，已保留 summary 和诊断信息便于排查。
          </p>
        </div>
      ) : null}

      <TeacherCopilotPanel
        payload={copilotPayload}
        defaultOpenSection={defaultOpenSection}
        sectionOrder={sectionOrder}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-900">重点儿童</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {keyChildren.map((item) => (
              <Badge key={item} variant="warning">
                {item}
              </Badge>
            ))}
          </div>
        </div>

        {result.riskTypes?.length ? (
          <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
            <p className="text-sm font-semibold text-slate-900">主要风险类型</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.riskTypes.map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        </div>

      {result.actionItems.length > 0 ? (
        <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-900">今日行动</p>
          <div className="mt-3 space-y-3">
            {result.actionItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-500" />
                    <p className="text-sm font-semibold text-slate-900">{item.target}</p>
                  </div>
                  <Badge variant="info">{item.timing}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">原因：{item.reason}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">建议动作：{item.action}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.actionItems.length === 0 ? (
        <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-900">今日行动</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            暂无行动项。请查看上方 dataQuality 与 fallbackReason，或点击页面上的重试生成。
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-indigo-600" />
          <p className="text-sm font-semibold text-slate-900">家长沟通建议</p>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-700">{parentMessage}</p>
      </div>

      {result.interventionCard ? (
        <InterventionCardPanel
          card={result.interventionCard}
          title="干预卡预览"
          footer={
            <div className="rounded-lg border border-white/70 bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">教师后续跟进草稿</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{result.interventionCard.teacherFollowupDraft}</p>
            </div>
          }
        />
      ) : null}

      {result.tomorrowObservationPoint ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">下一步建议</p>
          <p className="mt-2 text-sm leading-7 text-slate-700">{result.tomorrowObservationPoint}</p>
        </div>
      ) : null}

      <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-4">
        <p className="text-sm font-semibold text-slate-900">需要复查的事项</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {reviewItems.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />
        <span>生成时间：{buildTeacherAgentTimeLabel(result.generatedAt)}</span>
      </div>
    </div>
  );
}
