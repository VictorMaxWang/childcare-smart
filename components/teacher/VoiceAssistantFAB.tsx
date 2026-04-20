"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  LoaderCircle,
  Mic,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeacherVoiceGlueResult } from "@/lib/mobile/teacher-voice-understand";
import { cn } from "@/lib/utils";

export type VoiceAssistantFabStatus =
  | "unsupported"
  | "idle"
  | "requesting_permission"
  | "press_arming"
  | "recording"
  | "stopping"
  | "too_short"
  | "uploading"
  | "processing"
  | "success"
  | "error";

export interface VoiceAssistantFabChildOption {
  id: string;
  name: string;
  className: string;
}

export interface VoiceAssistantFabResult {
  upload: TeacherVoiceGlueResult["upload"];
  understanding: TeacherVoiceGlueResult["understanding"];
  understandingError: TeacherVoiceGlueResult["understandingError"];
  uiHintNextAction: TeacherVoiceGlueResult["uiHintNextAction"];
  recordingMeta: TeacherVoiceGlueResult["recordingMeta"];
}

interface VoiceAssistantFABProps {
  status: VoiceAssistantFabStatus;
  durationMs: number;
  statusLabel: string;
  statusHint: string;
  degradedHint?: string | null;
  cancelOnRelease?: boolean;
  disabled?: boolean;
  result: VoiceAssistantFabResult | null;
  childOptions: VoiceAssistantFabChildOption[];
  selectedChildId: string;
  onSelectedChildChange: (childId: string) => void;
  onPointerStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardToggle: () => void;
  onRetry: () => void;
  onCloseResult: () => void;
  onSaveDraft: () => void;
  onSaveAndContinue?: (nextAction: "teacher-agent" | "high-risk-consultation") => void;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function getNextActionLabel(nextAction: TeacherVoiceGlueResult["uiHintNextAction"]) {
  if (nextAction === "teacher-agent") {
    return "保存并前往教师 AI 助手";
  }
  if (nextAction === "high-risk-consultation") {
    return "保存并前往高风险会诊";
  }
  return null;
}

function getButtonTone(status: VoiceAssistantFabStatus) {
  if (status === "unsupported") {
    return "border-white/12 bg-[linear-gradient(180deg,rgba(21,24,52,0.86),rgba(12,14,32,0.8))] text-white/56 shadow-none";
  }
  if (status === "error") {
    return "border-violet-300/26 bg-linear-to-br from-[#2f1737] via-[#241733] to-[#17182f] text-white shadow-[0_18px_42px_rgba(67,41,107,0.34)]";
  }
  if (status === "recording" || status === "stopping") {
    return "border-violet-300/38 bg-linear-to-br from-indigo-600 via-violet-500 to-fuchsia-400 text-white shadow-[0_24px_54px_rgba(104,91,255,0.34)]";
  }
  if (status === "uploading" || status === "processing") {
    return "border-indigo-300/34 bg-linear-to-br from-[#0b1026] via-[#393c8f] to-violet-500 text-white shadow-[0_22px_50px_rgba(26,26,72,0.34)]";
  }
  if (status === "success") {
    return "border-violet-300/24 bg-linear-to-br from-indigo-500 via-violet-500 to-indigo-300 text-white shadow-[0_22px_50px_rgba(99,102,241,0.32)]";
  }
  if (status === "too_short") {
    return "border-fuchsia-300/28 bg-linear-to-br from-[#2b1f4a] via-[#251a43] to-[#151a35] text-white shadow-[0_22px_50px_rgba(84,64,164,0.3)]";
  }
  return "border-indigo-300/34 bg-linear-to-br from-indigo-500 via-violet-500 to-indigo-400 text-white shadow-[0_22px_50px_rgba(99,102,241,0.3)]";
}

function renderFabIcon(status: VoiceAssistantFabStatus) {
  if (status === "uploading" || status === "processing" || status === "requesting_permission") {
    return <LoaderCircle className="h-6 w-6 animate-spin" />;
  }
  if (status === "success") {
    return <CheckCircle2 className="h-6 w-6" />;
  }
  if (status === "error") {
    return <AlertTriangle className="h-6 w-6" />;
  }
  if (status === "recording" || status === "stopping") {
    return <AudioLines className="h-6 w-6" />;
  }
      return <Mic className="h-6 w-6" />;
}

export default function VoiceAssistantFAB({
  status,
  durationMs,
  statusLabel,
  statusHint,
  degradedHint,
  cancelOnRelease,
  disabled,
  result,
  childOptions,
  selectedChildId,
  onSelectedChildChange,
  onPointerStart,
  onPointerMove,
  onPointerEnd,
  onPointerCancel,
  onKeyboardToggle,
  onRetry,
  onCloseResult,
  onSaveDraft,
  onSaveAndContinue,
}: VoiceAssistantFABProps) {
  const nextActionLabel = getNextActionLabel(result?.uiHintNextAction);
  const canContinue =
    result?.uiHintNextAction === "teacher-agent" ||
    result?.uiHintNextAction === "high-risk-consultation";
  const understanding = result?.understanding ?? null;
  const previewItems = understanding?.draft_items.slice(0, 2) ?? [];
  const warnings = understanding?.warnings ?? [];

  return (
    <>
      <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-50 flex max-w-[min(16rem,calc(100vw-2rem))] flex-col items-end gap-3 sm:right-6">
        <Card surface="glass" glow="soft" interactive={false} className="pointer-events-auto max-w-full border-white/14 bg-white/8">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  degradedHint && status !== "error"
                    ? "info"
                    : status === "error"
                    ? "destructive"
                    : status === "success"
                      ? "secondary"
                      : status === "unsupported"
                        ? "secondary"
                        : "info"
                }
                className="gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI 语音
              </Badge>
              <p className="truncate text-sm font-semibold text-white">{statusLabel}</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/52">{statusHint}</p>
            {degradedHint ? (
              <div className="mt-2">
                <Badge variant="outline">演示兜底结果</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {status === "error" ? (
          <Button
            type="button"
            variant="secondary"
            className="pointer-events-auto min-h-10 rounded-full px-4"
            onClick={onRetry}
          >
            重新尝试
          </Button>
        ) : null}

        <button
          type="button"
          aria-label={`${statusLabel}，${statusHint}`}
          aria-disabled={disabled}
          aria-pressed={status === "recording"}
          className={cn(
            "voice-assistant-fab pointer-events-auto relative flex h-[5.5rem] w-[5.5rem] items-center justify-center overflow-hidden rounded-full border transition-all duration-300",
            getButtonTone(status),
            cancelOnRelease ? "scale-[1.04] ring-4 ring-fuchsia-200/55" : "",
            disabled ? "cursor-not-allowed opacity-90" : "cursor-pointer"
          )}
          disabled={disabled}
          onPointerDown={onPointerStart}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerCancel}
          onKeyDown={(event) => {
            if (event.repeat) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onKeyboardToggle();
            }
          }}
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          <span className="voice-assistant-glow" aria-hidden="true" />
          <span className="voice-assistant-wave voice-assistant-wave-delay-0" aria-hidden="true" />
          <span className="voice-assistant-wave voice-assistant-wave-delay-1" aria-hidden="true" />
          <span className="voice-assistant-wave voice-assistant-wave-delay-2" aria-hidden="true" />
          <span className="relative z-10 flex flex-col items-center justify-center gap-1">
            {renderFabIcon(status)}
            <span className="text-[11px] font-semibold tracking-[0.08em] text-white/95">
              {cancelOnRelease && (status === "press_arming" || status === "requesting_permission" || status === "recording")
                ? "松手取消"
                : status === "recording" ||
              status === "stopping" ||
              status === "uploading" ||
              status === "processing"
                ? formatDuration(durationMs)
                : status === "success"
                  ? "已完成"
                  : status === "error"
                    ? "重试"
                    : "按住说"}
            </span>
          </span>
        </button>

        <div className="sr-only" aria-live="polite">
          {statusLabel}，{statusHint}
        </div>
      </div>

      <Dialog open={Boolean(result)} onOpenChange={(open) => (!open ? onCloseResult() : undefined)}>
        <DialogContent className="voice-assistant-dialog left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-x-0 border-b-0 border-white/12 bg-[linear-gradient(180deg,rgba(13,16,37,0.98),rgba(8,10,24,0.96))] px-0 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-0 sm:right-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:border">
          {result ? (
            <div className="overflow-hidden">
              <div className="voice-assistant-sheet-header px-6 py-5">
                <DialogHeader>
                  <DialogTitle className="text-xl text-white">语音采集已完成</DialogTitle>
                  <DialogDescription className="mt-2 text-sm leading-6 text-white/64">
                    当前已完成采集、上传和草稿整理，后续可直接衔接教师 AI 助手或高风险会诊。
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-5 px-6 pt-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={result.upload.source === "mock" ? "outline" : "secondary"}>
                    {result.upload.source === "mock" ? "演示上传" : "正式上传"}
                  </Badge>
                  <Badge
                    variant={
                      result.upload.status === "processing"
                        ? "info"
                        : result.upload.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    状态：{result.upload.status === "processing" ? "处理中" : result.upload.status === "failed" ? "失败" : "已完成"}
                  </Badge>
                  {understanding ? (
                    <Badge variant={understanding.trace.fallback ? "outline" : "secondary"}>
                      {understanding.trace.fallback ? "本地兜底整理" : "结构化整理完成"}
                    </Badge>
                  ) : null}
                </div>

                <Card surface="glass" glow="soft" interactive={false} className="border-white/14 bg-white/8">
                  <CardContent className="p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/42">
                          文件
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {result.recordingMeta.fileName}
                        </p>
                        <p className="mt-1 text-xs text-white/54">
                          {result.recordingMeta.mimeType}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/42">
                          录音信息
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {formatDuration(result.recordingMeta.durationMs)}
                        </p>
                        <p className="mt-1 text-xs text-white/54">
                          {formatFileSize(result.recordingMeta.size)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {result.upload.source === "mock" || understanding?.trace.fallback ? (
                  <Card
                    surface="luminous"
                    glow="soft"
                    interactive={false}
                    className="border-white/14 bg-[linear-gradient(180deg,rgba(22,18,44,0.94),rgba(12,10,29,0.88))]"
                  >
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold text-white">结果说明</p>
                      <p className="mt-2 text-sm leading-6 text-white/68">
                        {result.upload.source === "mock" && understanding?.trace.fallback
                          ? "当前上传与理解均采用演示兜底结果，更适合录屏演示与草稿整理，请以正式数据为准。"
                          : result.upload.source === "mock"
                            ? "当前上传采用本地演示结果，适合录屏演示与草稿整理。"
                            : "当前理解结果采用本地兜底整理，适合录屏演示与草稿整理。"}
                      </p>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">归属儿童</p>
                  <Select value={selectedChildId} onValueChange={onSelectedChildChange}>
                    <SelectTrigger className="min-h-12 rounded-2xl border-white/14 bg-white/8 text-white">
                      <SelectValue placeholder="选择要保存到哪位幼儿" />
                    </SelectTrigger>
                    <SelectContent>
                      {childOptions.map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          {child.name} · {child.className}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">转写 / 草稿预览</p>
                  <Card
                    surface="luminous"
                    glow="brand"
                    interactive={false}
                    className="border-white/14 bg-[linear-gradient(180deg,rgba(18,21,48,0.94),rgba(10,12,30,0.86))]"
                  >
                    <CardContent className="p-4">
                      <p className="text-sm leading-7 text-white/74">
                        {understanding?.transcript.text ??
                          result.upload.transcript ??
                          result.upload.draftContent}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card surface="glass" glow="soft" interactive={false} className="border-white/14 bg-white/8">
                  <CardContent className="p-4">
                  <p className="text-sm font-semibold text-white">结构化理解预览</p>
                  {understanding ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="info">
                          主分类：{understanding.router_result.primary_category}
                        </Badge>
                        <Badge variant="secondary">
                          草稿项：{understanding.draft_items.length}
                        </Badge>
                      </div>
                      {previewItems.length > 0 ? (
                        <div className="space-y-2">
                          {previewItems.map((item) => (
                            <Card
                              key={`${item.category}-${item.raw_excerpt}`}
                              surface="solid"
                              glow="none"
                              interactive={false}
                              className="border-white/12 bg-white/6"
                            >
                              <CardContent className="p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/42">
                                  {item.category}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-white/72">{item.summary}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm leading-6 text-white/64">
                          当前没有可预览的 draft item，但理解链路已返回结构化结果。
                        </p>
                      )}
                      {warnings.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {warnings.map((warning) => (
                            <Badge key={warning} variant="outline">
                              {warning}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm leading-6 text-white/64">
                        T4 结构化理解暂未完成，本次仍可先保存上传结果为草稿。
                      </p>
                      {result.understandingError ? (
                        <Badge variant="destructive">{result.understandingError}</Badge>
                      ) : null}
                    </div>
                  )}
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3 pb-1">
                  <Button type="button" variant="premium" className="min-h-12 rounded-2xl" onClick={onSaveDraft}>
                    保存为教师语音草稿
                  </Button>
                  {canContinue && nextActionLabel && onSaveAndContinue ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-12 rounded-2xl"
                      onClick={() =>
                        onSaveAndContinue(
                          result.uiHintNextAction as
                            | "teacher-agent"
                            | "high-risk-consultation"
                        )
                      }
                    >
                      {nextActionLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 rounded-2xl"
                    onClick={onCloseResult}
                  >
                    继续录音
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
