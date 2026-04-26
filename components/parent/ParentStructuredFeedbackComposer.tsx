"use client";

import { useState } from "react";
import type { ConsultationResult } from "@/lib/ai/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import type {
  GuardianFeedback,
  ParentFeedbackAttachments,
  ParentFeedbackChildReaction,
  ParentFeedbackExecutionStatus,
  ParentFeedbackExecutorRole,
  ParentFeedbackImprovementStatus,
} from "@/lib/feedback/types";
import type { CanonicalTask } from "@/lib/tasks/types";
import { formatParentFeedbackStatusLabel } from "@/lib/feedback/consumption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ParentVoiceNoteInput from "@/components/parent/ParentVoiceNoteInput";
import { cn } from "@/lib/utils";

type ExecutionCountOption = 1 | 2 | 3;

const EXECUTION_STATUS_OPTIONS: Array<{
  value: ParentFeedbackExecutionStatus;
  label: string;
}> = [
  { value: "completed", label: "已做" },
  { value: "partial", label: "做了一部分" },
  { value: "not_started", label: "还没做" },
];

const CHILD_REACTION_OPTIONS: Array<{
  value: ParentFeedbackChildReaction;
  label: string;
}> = [
  { value: "resisted", label: "抗拒" },
  { value: "neutral", label: "一般" },
  { value: "accepted", label: "愿意配合" },
  { value: "improved", label: "明显更顺" },
];

const IMPROVEMENT_STATUS_OPTIONS: Array<{
  value: ParentFeedbackImprovementStatus;
  label: string;
}> = [
  { value: "no_change", label: "没变化" },
  { value: "slight_improvement", label: "有一点好转" },
  { value: "clear_improvement", label: "明显好转" },
  { value: "worse", label: "更糟了" },
];

const EXECUTION_COUNT_OPTIONS: Array<{
  value: ExecutionCountOption;
  label: string;
}> = [
  { value: 1, label: "1次" },
  { value: 2, label: "2次" },
  { value: 3, label: "3次" },
];

const EXECUTOR_ROLE_OPTIONS: Array<{
  value: ParentFeedbackExecutorRole;
  label: string;
}> = [
  { value: "parent", label: "家长" },
  { value: "grandparent", label: "祖辈" },
  { value: "caregiver", label: "照护人" },
  { value: "mixed", label: "多人配合" },
];

const BARRIER_OPTIONS = [
  "孩子抗拒",
  "今晚没时间",
  "照护人没对齐",
  "孩子状态不好",
  "不确定怎么做",
] as const;

function toggleBarrier(barriers: string[], nextBarrier: string) {
  return barriers.includes(nextBarrier)
    ? barriers.filter((item) => item !== nextBarrier)
    : [...barriers, nextBarrier];
}

export interface ParentStructuredFeedbackComposerSubmitInput {
  childId: string;
  executionStatus: ParentFeedbackExecutionStatus;
  executionCount?: number;
  executorRole: ParentFeedbackExecutorRole;
  childReaction: ParentFeedbackChildReaction;
  improvementStatus: ParentFeedbackImprovementStatus;
  barriers: string[];
  notes: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  interventionCardId?: string;
  attachments: ParentFeedbackAttachments;
}

interface ParentStructuredFeedbackComposerProps {
  childId: string;
  interventionCard?: InterventionCard | null;
  activeTask?: CanonicalTask;
  consultation?: ConsultationResult;
  feedbackPrompt?: string;
  reminderStatus?: string;
  latestFeedback?: GuardianFeedback;
  statusMessage?: string | null;
  notePrefill?: { value: string; token: number } | null;
  initialSelections?: {
    executionStatus?: ParentFeedbackExecutionStatus | null;
    executionCount?: number;
    executorRole?: ParentFeedbackExecutorRole;
    childReaction?: ParentFeedbackChildReaction | null;
    improvementStatus?: ParentFeedbackImprovementStatus | null;
    barriers?: string[];
    expandDetails?: boolean;
  };
  onSubmit: (input: ParentStructuredFeedbackComposerSubmitInput) => Promise<boolean>;
  onSnoozeReminder?: () => void;
  careMode?: boolean;
}

function getOptionButtonClassName(careMode: boolean) {
  return careMode ? "min-h-12 rounded-2xl px-4 text-base" : "rounded-full";
}

export default function ParentStructuredFeedbackComposer({
  childId,
  interventionCard,
  activeTask,
  consultation,
  feedbackPrompt,
  reminderStatus,
  latestFeedback,
  statusMessage,
  notePrefill,
  initialSelections,
  onSubmit,
  onSnoozeReminder,
  careMode = false,
}: ParentStructuredFeedbackComposerProps) {
  const [executionStatus, setExecutionStatus] =
    useState<ParentFeedbackExecutionStatus | null>(() => initialSelections?.executionStatus ?? null);
  const [executionCount, setExecutionCount] = useState<number | undefined>(() => initialSelections?.executionCount ?? 1);
  const [childReaction, setChildReaction] =
    useState<ParentFeedbackChildReaction | null>(() => initialSelections?.childReaction ?? null);
  const [improvementStatus, setImprovementStatus] =
    useState<ParentFeedbackImprovementStatus | null>(() => initialSelections?.improvementStatus ?? null);
  const [executorRole, setExecutorRole] =
    useState<ParentFeedbackExecutorRole>(() => initialSelections?.executorRole ?? "parent");
  const [barriers, setBarriers] = useState<string[]>(() => initialSelections?.barriers ?? []);
  const [notes, setNotes] = useState(() => notePrefill?.value ?? "");
  const [showDetails, setShowDetails] = useState(() =>
    careMode
      ? false
      : Boolean(notePrefill?.value || initialSelections?.expandDetails || (initialSelections?.barriers?.length ?? 0) > 0)
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const composerMessage = validationMessage ?? statusMessage;
  const reviewLabel =
    consultation?.followUp48h?.[0] ??
    interventionCard?.reviewIn48h ??
    "提交后会继续带入 48 小时复查上下文。";
  const optionButtonClassName = getOptionButtonClassName(careMode);

  function handleNotesChange(nextValue: string) {
    setNotes(nextValue);
    setShowDetails(true);
    if (validationMessage) {
      setValidationMessage(null);
    }
  }

  async function handleSubmit() {
    if (!interventionCard) {
      setValidationMessage("当前还没有可关联的干预卡，暂时无法提交结构化反馈。");
      return;
    }
    if (!executionStatus) {
      setValidationMessage("请先选择今晚做了没有。");
      return;
    }
    if (!childReaction) {
      setValidationMessage("请先选择孩子反应怎样。");
      return;
    }
    if (!improvementStatus) {
      setValidationMessage("请先选择有没有更好一点。");
      return;
    }

    setValidationMessage(null);
    setSubmitting(true);
    const submitted = await onSubmit({
      childId,
      executionStatus,
      executionCount:
        executionStatus === "not_started" ? undefined : executionCount ?? 1,
      executorRole,
      childReaction,
      improvementStatus,
      barriers,
      notes: notes.trim(),
      relatedTaskId: activeTask?.taskId,
      relatedConsultationId:
        interventionCard.consultationId ?? consultation?.consultationId,
      interventionCardId: interventionCard.id,
      attachments: {},
    });

    setSubmitting(false);
    if (!submitted) {
      return;
    }

    setExecutionStatus(null);
    setExecutionCount(1);
    setChildReaction(null);
    setImprovementStatus(null);
    setExecutorRole("parent");
    setBarriers([]);
    setNotes("");
    setShowDetails(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-100 bg-white p-4">
        {!careMode ? (
          <div className="flex flex-wrap gap-2">
            {activeTask ? <Badge variant="info">已关联今晚任务</Badge> : null}
            {interventionCard?.consultationId || consultation ? (
              <Badge variant="warning">已关联复查上下文</Badge>
            ) : null}
            {latestFeedback ? (
              <Badge variant="secondary">最近反馈：{formatParentFeedbackStatusLabel(latestFeedback.status)}</Badge>
            ) : (
              <Badge variant="secondary">今晚可提交首条结构化反馈</Badge>
            )}
            {reminderStatus ? (
              <Badge variant="outline">提醒状态：{reminderStatus}</Badge>
            ) : null}
          </div>
        ) : (
          <Badge variant="info" className="px-3 py-1 text-sm">
            快速反馈
          </Badge>
        )}
        <p className={careMode ? "mt-4 text-lg font-semibold leading-8 text-slate-900" : "mt-3 text-sm font-semibold text-slate-900"}>
          {interventionCard?.title ?? "当前暂无可提交反馈的干预卡"}
        </p>
        <p className={careMode ? "mt-3 text-base leading-8 text-slate-700" : "mt-2 text-sm leading-6 text-slate-600"}>
          {interventionCard?.tonightHomeAction ??
            "请先生成或选择当前干预卡，提交按钮会在有上下文后启用。"}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          48 小时内复查：{reviewLabel}
        </p>
        {careMode && notePrefill?.value && !showDetails ? (
          <p className="mt-3 text-sm leading-6 text-sky-700">
            已带入一条补充草稿，可在“补充情况（可选）”里查看。
          </p>
        ) : null}
      </div>

      <div className={cn("grid gap-4", careMode ? "grid-cols-1" : "lg:grid-cols-3")}>
        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
            今晚做了没有
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXECUTION_STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={executionStatus === option.value ? "premium" : "outline"}
                className={optionButtonClassName}
                onClick={() => {
                  setExecutionStatus(option.value);
                  setExecutionCount((current) =>
                    option.value === "not_started" ? undefined : current ?? 1
                  );
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {executionStatus && executionStatus !== "not_started" ? (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-[0.14em] text-slate-400">
                执行次数
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXECUTION_COUNT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={executionCount === option.value ? "premium" : "outline"}
                    className={optionButtonClassName}
                    onClick={() => setExecutionCount(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
            孩子反应怎样
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CHILD_REACTION_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={childReaction === option.value ? "premium" : "outline"}
                className={optionButtonClassName}
                onClick={() => setChildReaction(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
            有没有更好一点
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {IMPROVEMENT_STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={improvementStatus === option.value ? "premium" : "outline"}
                className={optionButtonClassName}
                onClick={() => setImprovementStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
              {careMode ? "补充情况（可选）" : "补充更多情况"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {careMode
                ? "这些内容不是必须填，只有需要时再展开。"
                : "阻碍、执行人、补充说明都放在第二层，不打断第一步快速反馈。"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className={careMode ? "min-h-11 rounded-2xl px-4 text-base" : "rounded-full"}
            onClick={() => setShowDetails((current) => !current)}
          >
            {showDetails ? "收起补充" : careMode ? "打开补充情况" : "补充更多"}
          </Button>
        </div>

        <div className="mt-4">
          <ParentVoiceNoteInput
            value={notes}
            onChange={handleNotesChange}
            careMode={careMode}
            disabled={!interventionCard}
          />
        </div>

        {showDetails ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-white/80 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                谁来执行
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXECUTOR_ROLE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={executorRole === option.value ? "premium" : "outline"}
                    className={optionButtonClassName}
                    onClick={() => setExecutorRole(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                遇到哪些阻碍
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {BARRIER_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={barriers.includes(option) ? "premium" : "outline"}
                    className={optionButtonClassName}
                    onClick={() => setBarriers((current) => toggleBarrier(current, option))}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                补充说明
              </p>
              <Textarea
                value={notes}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="补充今晚的场景、持续时间、孩子状态，或家里观察到的细节。"
                className={cn("mt-3 bg-white", careMode ? "min-h-32 text-base" : "min-h-28")}
              />
            </div>

            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                附件补充
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                语音和图片补充将在后续任务接入。本轮先保留结构化字段与占位入口，不上传文件。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" className={optionButtonClassName} disabled>
                  语音补充 稍后开放
                </Button>
                <Button type="button" variant="outline" className={optionButtonClassName} disabled>
                  图片补充 稍后开放
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
        <div>
          <p className={careMode ? "text-base font-semibold leading-8 text-slate-900" : "text-sm font-semibold text-slate-900"}>
            {feedbackPrompt ?? "提交后，今晚反馈会进入下一轮家长建议与跟进。"}
          </p>
          {!careMode ? (
            <p className="mt-1 text-sm text-slate-600">
              先把关键结果记下来，后续建议会据此继续更新。
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onSnoozeReminder ? (
            <Button
              type="button"
              variant="outline"
              className={careMode ? "min-h-12 rounded-2xl px-4 text-base" : "rounded-xl"}
              onClick={onSnoozeReminder}
            >
              稍后提醒
            </Button>
          ) : null}
          <Button
            type="button"
            className={careMode ? "min-h-12 rounded-2xl px-5 text-base" : "rounded-xl"}
            onClick={() => void handleSubmit()}
            disabled={!interventionCard || submitting}
          >
            {submitting ? "提交中..." : "提交今晚反馈"}
          </Button>
        </div>
      </div>

      {composerMessage ? (
        <p className={careMode ? "text-base leading-7 text-slate-600" : "text-sm text-slate-600"}>
          {composerMessage}
        </p>
      ) : null}
    </div>
  );
}
