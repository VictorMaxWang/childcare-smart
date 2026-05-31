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
import AttachmentMediaPicker, { type AttachmentDraft } from "@/components/communication/AttachmentMediaPicker";
import ParentVoiceNoteInput from "@/components/parent/ParentVoiceNoteInput";
import { cn } from "@/lib/utils";
import { CheckCircle2, ClipboardList, Heart, Moon, ShieldCheck, Utensils } from "lucide-react";

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
  attachmentDrafts?: AttachmentDraft[];
}

interface ParentStructuredFeedbackComposerProps {
  childId: string;
  childName: string;
  childClassName?: string;
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

function buildFeedbackAttachments(drafts: AttachmentDraft[]): ParentFeedbackAttachments {
  const voice = drafts
    .filter((item) => item.kind === "audio")
    .map((item) => ({
      url: item.localPreviewUrl,
      name: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.byteSize,
      meta: { attachmentDraftId: item.id, kind: item.kind, durationMs: item.durationMs },
    }));
  const image = drafts
    .filter((item) => item.kind === "image")
    .map((item) => ({
      url: item.localPreviewUrl,
      name: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.byteSize,
      meta: { attachmentDraftId: item.id, kind: item.kind },
    }));
  return {
    ...(voice.length > 0 ? { voice } : {}),
    ...(image.length > 0 ? { image } : {}),
  };
}

export default function ParentStructuredFeedbackComposer({
  childId,
  childName,
  childClassName,
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
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([]);

  const composerMessage = validationMessage ?? statusMessage;
  const reviewLabel =
    consultation?.followUp48h?.[0] ??
    interventionCard?.reviewIn48h ??
    "提交后会继续带入 48 小时复查上下文。";
  const optionButtonClassName = getOptionButtonClassName(careMode);
  const pixelMoodOptions: Array<{
    label: string;
    value: ParentFeedbackChildReaction;
    face: string;
  }> = [
    { label: "不太好", value: "resisted", face: "☹" },
    { label: "一般", value: "neutral", face: "◔" },
    { label: "还可以", value: "accepted", face: "☺" },
    { label: "开心", value: "improved", face: "☻" },
    { label: "非常开心", value: "improved", face: "●" },
  ];
  const pixelSleepOptions: Array<{
    label: string;
    value: ParentFeedbackImprovementStatus;
    face: string;
  }> = [
    { label: "很差", value: "no_change", face: "☹" },
    { label: "一般", value: "no_change", face: "◔" },
    { label: "还行", value: "slight_improvement", face: "☺" },
    { label: "较好", value: "slight_improvement", face: "☽" },
    { label: "非常好", value: "clear_improvement", face: "○" },
  ];
  const pixelAppetiteOptions: Array<{
    label: string;
    value: ParentFeedbackExecutionStatus;
    face: string;
  }> = [
    { label: "很差", value: "not_started", face: "☹" },
    { label: "一般", value: "partial", face: "◔" },
    { label: "正常", value: "completed", face: "☺" },
    { label: "较好", value: "completed", face: "☻" },
    { label: "非常好", value: "completed", face: "●" },
  ];

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
      attachments: buildFeedbackAttachments(attachmentDrafts),
      attachmentDrafts,
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
    setAttachmentDrafts([]);
    setShowDetails(false);
  }

  if (typeof childId === "string") {
    return (
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-cover bg-center bg-no-repeat shadow-inner"
                aria-hidden="true"
                style={{
                  backgroundImage: "url('/pixel-replica/parent/parent-feedback-avatar.png')",
                }}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-black tracking-normal text-slate-950">
                    {childName}
                  </h3>
                  <Badge variant="info" className="rounded-full px-3 py-1">
                    {childClassName ?? "当前班级"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-xl font-bold text-slate-950">今晚家庭干预卡</p>
                  <Badge variant={executionStatus ? "success" : "warning"} className="rounded-full px-3 py-1">
                    {executionStatus ? "填写中" : "待反馈"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="flex items-center gap-1 text-sm font-semibold text-violet-600 sm:justify-end">
                <ShieldCheck className="h-4 w-4" />
                隐私安全
              </div>
              <p className="mt-3 text-sm text-slate-500">截止时间</p>
              <p className="mt-1 text-xl font-black text-violet-600">今日 21:00</p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
                <ClipboardList className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-7 text-slate-700">
                  给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。
                </p>
                <p className="mt-2 text-sm leading-6 text-violet-600">{feedbackPrompt ?? interventionCard?.tonightHomeAction ?? reviewLabel}</p>
              </div>
              <span className="hidden items-center gap-1 text-sm font-semibold text-violet-600 sm:flex">
                查看详情
                <span aria-hidden="true">›</span>
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black tracking-normal text-slate-950">今晚完成情况</h3>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-400">?</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {EXECUTION_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`feedback-execution-${option.value}`}
                onClick={() => {
                  setExecutionStatus(option.value);
                  setExecutionCount((current) =>
                    option.value === "not_started" ? undefined : current ?? 1
                  );
                }}
                className={cn(
                  "flex min-h-14 items-center justify-center rounded-[18px] border px-3 text-base font-bold transition",
                  executionStatus === option.value
                    ? "border-violet-500 bg-white text-violet-600 shadow-[0_12px_28px_rgb(124_58_237_/_0.16)]"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                {option.label === "已做" ? "已完成" : option.label}
                {executionStatus === option.value ? (
                  <CheckCircle2 className="ml-2 h-5 w-5 text-violet-500" />
                ) : null}
              </button>
            ))}
          </div>
          {executionStatus && executionStatus !== "not_started" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {EXECUTION_COUNT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={executionCount === option.value ? "premium" : "outline"}
                  className="rounded-full"
                  onClick={() => setExecutionCount(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
          <h3 className="text-xl font-black tracking-normal text-slate-950">孩子今晚状态</h3>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <Heart className="h-5 w-5" />
                </span>
                <span className="font-bold text-slate-950">心情</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-2">
                {pixelMoodOptions.map((option, index) => {
                  const selected = childReaction === option.value && (option.value !== "improved" || index === 4);
                  return (
                    <button
                      key={`${option.label}-${index}`}
                      type="button"
                      data-testid={`feedback-reaction-${option.value}-${index}`}
                      onClick={() => setChildReaction(option.value)}
                      className="text-center"
                    >
                      <span
                        className={cn(
                          "mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-lg font-black",
                          selected
                            ? "border-violet-500 bg-violet-500 text-white shadow-[0_8px_20px_rgb(124_58_237_/_0.2)]"
                            : "border-slate-200 bg-white text-slate-400"
                        )}
                      >
                        {option.face}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                  <Moon className="h-5 w-5" />
                </span>
                <span className="font-bold text-slate-950">睡眠</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-2">
                {pixelSleepOptions.map((option, index) => {
                  const selected =
                    improvementStatus === option.value &&
                    (option.value !== "slight_improvement" || index === 3) &&
                    (option.value !== "no_change" || index === 1);
                  return (
                    <button
                      key={`${option.label}-${index}`}
                      type="button"
                      data-testid={`feedback-improvement-${option.value}-${index}`}
                      onClick={() => setImprovementStatus(option.value)}
                      className="text-center"
                    >
                      <span
                        className={cn(
                          "mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-lg font-black",
                          selected
                            ? "border-blue-500 bg-blue-500 text-white shadow-[0_8px_20px_rgb(59_130_246_/_0.2)]"
                            : "border-slate-200 bg-white text-slate-400"
                        )}
                      >
                        {option.face}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Utensils className="h-5 w-5" />
                </span>
                <span className="font-bold text-slate-950">食欲</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-2">
                {pixelAppetiteOptions.map((option, index) => {
                  const selected =
                    executionStatus === option.value &&
                    (option.value !== "completed" || index === 2);
                  return (
                    <button
                      key={`${option.label}-${index}`}
                      type="button"
                      data-testid={`feedback-appetite-${option.value}-${index}`}
                      onClick={() => {
                        setExecutionStatus(option.value);
                        setExecutionCount(option.value === "not_started" ? undefined : 1);
                      }}
                      className="text-center"
                    >
                      <span
                        className={cn(
                          "mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-lg font-black",
                          selected
                            ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_20px_rgb(16_185_129_/_0.2)]"
                            : "border-slate-200 bg-white text-slate-400"
                        )}
                      >
                        {option.face}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
          <h3 className="text-xl font-black tracking-normal text-slate-950">观察到的情况 <span className="text-base font-normal text-slate-400">（可多选）</span></h3>
          <div className="mt-5 flex flex-wrap gap-3">
            {["主动参与", "注意力较好", "需要提醒", "情绪稳定", "有求助行为", "按步骤完成", "其他"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBarriers((current) => toggleBarrier(current, option))}
                className={cn(
                  "rounded-[16px] border px-5 py-3 text-base font-semibold transition",
                  barriers.includes(option)
                    ? "border-violet-500 bg-violet-50 text-violet-600"
                    : "border-slate-200 bg-white text-slate-500"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
          <h3 className="text-xl font-black tracking-normal text-slate-950">补充说明 <span className="text-base font-normal text-slate-400">（选填）</span></h3>
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-white p-4">
            <Textarea
              value={notes}
              onChange={(event) => handleNotesChange(event.target.value)}
              placeholder="可以描述孩子的表现、遇到的困难或其他想告诉老师的内容..."
              className="min-h-28 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
              maxLength={200}
            />
            <p className="mt-2 text-right text-sm text-slate-400">{notes.length}/200</p>
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-lg font-bold text-slate-950">上传照片/视频 <span className="text-base font-normal text-slate-400">（选填）</span></h4>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                有助于老师更好地了解孩子的情况；当前 MVP 保存附件元数据和本地预览，不伪装为云端上传成功。
              </p>
            </div>
            <div className="w-full sm:max-w-md">
              <AttachmentMediaPicker
                value={attachmentDrafts}
                onChange={setAttachmentDrafts}
                accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
                disabled={!interventionCard || submitting}
              />
            </div>
          </div>
        </section>

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-10 sm:bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] lg:bottom-4">
          <Button
            type="button"
            data-testid="parent-submit-structured-feedback"
            className="h-16 w-full rounded-[28px] bg-[linear-gradient(135deg,#5b46ff,#7c3aed)] text-xl font-black text-white shadow-[0_18px_44px_rgb(91_70_255_/_0.28)]"
            onClick={() => void handleSubmit()}
            disabled={!interventionCard || submitting}
            loading={submitting}
          >
            提交反馈
          </Button>
        </div>

        {onSnoozeReminder ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onSnoozeReminder}
          >
            稍后提醒
          </Button>
        ) : null}

        {composerMessage ? (
          <p
            className={cn(
              "rounded-[18px] border px-4 py-3 text-sm leading-6",
              validationMessage
                ? "border-(--danger-border) bg-(--danger-soft) text-(--danger-foreground)"
                : "border-(--info-border) bg-(--info-soft) text-(--info-foreground)"
            )}
            role={validationMessage ? "alert" : "status"}
          >
            {composerMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.6rem] border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#fff7ed_100%)] p-4 shadow-[0_18px_52px_rgb(99_102_241_/_0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dbeafe,#ede9fe)] text-xl font-black text-indigo-600">
              童
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-bold text-slate-950">今晚家庭干预卡</p>
                <Badge variant={executionStatus ? "success" : "warning"} className="rounded-full">
                  {executionStatus ? "填写中" : "待反馈"}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                {interventionCard?.title ?? "先完成今晚建议，再把孩子反应告诉老师。"}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
              隐私安全
            </div>
            <p className="mt-2 text-sm font-semibold text-indigo-600">今日 21:00</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
              <Moon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950">给家长的沟通话术</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {feedbackPrompt ?? interventionCard?.tonightHomeAction ?? "先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "心情", icon: Heart, active: childReaction === "improved" || childReaction === "accepted" },
            { label: "睡眠", icon: Moon, active: improvementStatus === "slight_improvement" || improvementStatus === "clear_improvement" },
            { label: "食欲", icon: CheckCircle2, active: executionStatus === "completed" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full",
                      item.active ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.active ? "已选择" : "待选择"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
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
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
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

        <div className="rounded-2xl border border-slate-100 bg-white p-4">
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

        <div className="rounded-2xl border border-slate-100 bg-white p-4">
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

      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
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
            <div className="rounded-2xl border border-white/80 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                谁来执行
              </p>
              <div className="hidden">
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

            <div className="rounded-2xl border border-white/80 bg-white p-4">
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

            <div className="rounded-2xl border border-white/80 bg-white p-4">
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

            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4">
              <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
                附件补充
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                支持图片、文件和语音补充；当前 MVP 保存附件元数据和本地预览，保存后老师可在反馈详情中查看和播放，不伪装为云端对象存储。
              </p>
              <div className="mt-3">
                <AttachmentMediaPicker
                  value={attachmentDrafts}
                  onChange={setAttachmentDrafts}
                  accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
                  disabled={!interventionCard || submitting}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={careMode ? "text-base font-semibold leading-8 text-slate-900" : "text-sm font-semibold text-slate-900"}>
          {feedbackPrompt ?? "提交后，今晚反馈会写入家园沟通记录，并进入下一轮家长建议与跟进。"}
          </p>
          {!careMode ? (
            <p className="mt-1 text-sm text-slate-600">
              先把关键结果记下来，后续建议会据此继续更新。
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {onSnoozeReminder ? (
            <Button
              type="button"
              variant="outline"
              className={cn("w-full sm:w-auto", careMode ? "min-h-12 rounded-lg px-4 text-base" : "rounded-lg")}
              onClick={onSnoozeReminder}
            >
              稍后提醒
            </Button>
          ) : null}
          <Button
            type="button"
            className={cn("w-full sm:w-auto", careMode ? "min-h-12 rounded-lg px-5 text-base" : "rounded-lg")}
            onClick={() => void handleSubmit()}
            disabled={!interventionCard || submitting}
            loading={submitting}
          >
            提交今晚反馈
          </Button>
        </div>
      </div>

      {composerMessage ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 leading-6",
            validationMessage
              ? "border-(--danger-border) bg-(--danger-soft) text-(--danger-foreground)"
              : "border-(--info-border) bg-(--info-soft) text-(--info-foreground)",
            careMode ? "text-base" : "text-sm"
          )}
          role={validationMessage ? "alert" : "status"}
        >
          {composerMessage}
        </p>
      ) : null}
    </div>
  );
}
