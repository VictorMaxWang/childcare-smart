"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import VoiceAssistantFAB, {
  type VoiceAssistantFabStatus,
} from "@/components/teacher/VoiceAssistantFAB";
import {
  buildTeacherAgentClassContext,
  pickTeacherAgentDefaultChildId,
} from "@/lib/agent/teacher-agent";
import { useApp } from "@/lib/store";
import {
  buildVoiceDraftFromUpload,
  getVoiceDraftSyncStatus,
} from "@/lib/mobile/voice-input";
import {
  type TeacherVoiceGlueResult,
  understandTeacherVoiceFromUpload,
} from "@/lib/mobile/teacher-voice-understand";
import { uploadTeacherVoiceCapture } from "@/lib/mobile/voice-assistant-upload";
import { useVoiceRecorder } from "@/lib/mobile/use-voice-recorder";

const LONG_PRESS_MS = 180;
const MIN_DURATION_MS = 600;
const PROCESSING_DELAY_MS = 480;
const POINTER_CANCEL_MARGIN_PX = 36;

function buildStatusHint(params: {
  status: VoiceAssistantFabStatus;
  supportState: ReturnType<typeof useVoiceRecorder>["supportState"];
  permissionState: ReturnType<typeof useVoiceRecorder>["permissionState"];
  recorderErrorCode: string | null;
  errorMessage: string | null;
  cancelOnRelease: boolean;
  fallbackHint: string | null;
}) {
  if (params.supportState === "checking") {
    return {
      label: "检查设备中",
      hint: "正在确认当前浏览器是否支持语音采集。",
    };
  }

  switch (params.status) {
    case "unsupported":
      return {
        label: "暂不支持",
        hint:
          params.permissionState === "denied"
            ? "浏览器已拒绝麦克风权限，请在系统或浏览器设置里重新允许。"
            : "当前浏览器不支持这条语音录制链路，建议优先使用 Android Chrome 或 iOS Safari。",
      };
    case "press_arming":
      return {
        label: params.cancelOnRelease ? "松手将取消" : "继续按住",
        hint: params.cancelOnRelease
          ? "已滑出录音安全区，松手后会取消本次录音，不会上传。"
          : "保持按压约 0.2 秒后开始录音，避免误触。",
      };
    case "requesting_permission":
      return {
        label: "请求权限中",
        hint: params.cancelOnRelease
          ? "已滑出录音安全区，松手后会取消本次录音。"
          : "请允许麦克风权限。首次授权完成后，如未开始录音，请再长按一次。",
      };
    case "recording":
      return {
        label: params.cancelOnRelease ? "松手将取消" : "录音中",
        hint: params.cancelOnRelease
          ? "已滑出录音安全区，松手后取消本次录音，不会上传。"
          : "继续按住录音，松开结束；滑出按钮安全区后松手会取消。",
      };
    case "stopping":
      return {
        label: "正在收尾",
        hint: "正在整理音频片段并生成可上传文件。",
      };
    case "too_short":
      return {
        label: "录音太短",
        hint: "请至少说满 0.6 秒，让系统生成有效语音草稿。",
      };
    case "uploading":
      return {
        label: "上传中",
        hint: "正在上传语音并整理为可继续处理的草稿。",
      };
    case "processing":
      return {
        label: "识别中",
        hint:
          params.fallbackHint ??
          "正在整理语音内容，生成可确认的草稿项和提醒。",
      };
    case "success":
      return {
        label: params.fallbackHint ? "已生成演示结果" : "上传完成",
        hint:
          params.fallbackHint ??
          "可以把这条语音保存为教师草稿，或继续进入下一步处理。",
      };
    case "error":
      if (
        params.recorderErrorCode === "microphone_permission_denied" ||
        params.permissionState === "denied"
      ) {
        return {
          label: "需要麦克风权限",
          hint:
            params.errorMessage ??
            "麦克风权限被拒绝，请在浏览器设置里重新允许后再长按录音。",
        };
      }
      if (params.recorderErrorCode === "microphone_not_readable") {
        return {
          label: "麦克风被占用",
          hint:
            params.errorMessage ??
            "麦克风当前不可用，可能被别的应用占用，请释放后重试。",
        };
      }
      if (
        params.recorderErrorCode === "microphone_interrupted" ||
        params.recorderErrorCode === "voice_recorder_stream_error" ||
        params.recorderErrorCode === "voice_recorder_page_hidden"
      ) {
        return {
          label: "录音已中断",
          hint:
            params.errorMessage ??
            "录音过程中发生中断，请回到页面后重新长按录音。",
        };
      }
      return {
        label: "采集失败",
        hint: params.errorMessage ?? "录音或上传没有完成，请点击重试后重新说一遍。",
      };
    default:
      return {
        label: "长按说话",
        hint: "像手机 AI 助手一样长按录音，松开结束并生成上传入口。",
      };
  }
}

function buildRecorderErrorMessage(errorCode: string | null) {
  if (!errorCode) return null;
  if (errorCode === "microphone_permission_denied") {
    return "麦克风权限被拒绝，请在浏览器设置里允许访问。";
  }
  if (errorCode === "microphone_not_found") {
    return "当前设备没有可用的麦克风。";
  }
  if (errorCode === "microphone_not_readable") {
    return "麦克风当前不可用，可能被别的应用占用。";
  }
  if (errorCode === "voice_recorder_not_supported") {
    return "当前浏览器不支持语音录制。";
  }
  if (errorCode === "microphone_interrupted") {
    return "录音被系统或麦克风状态中断，请重新长按录音。";
  }
  if (errorCode === "voice_recorder_stream_error") {
    return "录音流已中断，请重新按住录音。";
  }
  if (errorCode === "voice_recorder_page_hidden") {
    return "页面切到后台后，本次录音已取消。请回到页面后重新长按。";
  }
  return "录音没有成功开始，请重试。";
}

function buildFallbackNotice(params: {
  uploadSource: TeacherVoiceGlueResult["upload"]["source"];
  understandingFallback: boolean;
}) {
  if (params.uploadSource === "mock" && params.understandingFallback) {
    return "当前上传与理解均采用演示兜底结果，适合演示和草稿整理，请以正式数据为准。";
  }
  if (params.uploadSource === "mock") {
    return "当前上传采用本地演示结果，适合演示和草稿整理。";
  }
  if (params.understandingFallback) {
    return "当前理解结果采用本地兜底整理，适合演示和草稿整理。";
  }
  return null;
}

export default function TeacherVoiceAssistantLayer() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
    saveMobileDraft,
    markMobileDraftSyncStatus,
  } = useApp();
  const recorder = useVoiceRecorder();

  const [status, setStatus] = useState<VoiceAssistantFabStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackHint, setFallbackHint] = useState<string | null>(null);
  const [cancelOnRelease, setCancelOnRelease] = useState(false);
  const [result, setResult] = useState<TeacherVoiceGlueResult | null>(null);
  const [resultChildId, setResultChildId] = useState("");

  const armingTimerRef = useRef<number | null>(null);
  const processingTimerRef = useRef<number | null>(null);
  const pointerPressedRef = useRef(false);
  const cancelOnReleaseRef = useRef(false);
  const previousPathRef = useRef(pathname);
  const asyncFlowRef = useRef(0);

  const classContext = useMemo(
    () =>
      currentUser.role === "教师"
        ? buildTeacherAgentClassContext({
            currentUser,
            visibleChildren,
            presentChildren,
            healthCheckRecords,
            growthRecords,
            guardianFeedbacks,
          })
        : null,
    [
      currentUser,
      guardianFeedbacks,
      growthRecords,
      healthCheckRecords,
      presentChildren,
      visibleChildren,
    ]
  );

  const defaultChildId = useMemo(
    () =>
      classContext
        ? pickTeacherAgentDefaultChildId(classContext) ?? visibleChildren[0]?.id ?? ""
        : visibleChildren[0]?.id ?? "",
    [classContext, visibleChildren]
  );

  const childOptions = useMemo(
    () =>
      visibleChildren.map((child) => ({
        id: child.id,
        name: child.name,
        className: child.className,
      })),
    [visibleChildren]
  );

  const isTeacherReady = currentUser.role === "教师";
  const disabled =
    !isTeacherReady ||
    visibleChildren.length === 0 ||
    recorder.supportState === "checking" ||
    recorder.supportState === "unsupported";
  const effectiveStatus =
    recorder.supportState === "unsupported" ? "unsupported" : status;
  const selectedResultChildId =
    resultChildId && visibleChildren.some((child) => child.id === resultChildId)
      ? resultChildId
      : defaultChildId;

  const clearArmingTimer = useCallback(() => {
    if (armingTimerRef.current !== null) {
      window.clearTimeout(armingTimerRef.current);
      armingTimerRef.current = null;
    }
  }, []);

  const clearProcessingTimer = useCallback(() => {
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  const updateCancelOnRelease = useCallback((nextValue: boolean) => {
    cancelOnReleaseRef.current = nextValue;
    setCancelOnRelease(nextValue);
  }, []);

  const resetToIdle = useCallback(() => {
    asyncFlowRef.current += 1;
    clearArmingTimer();
    clearProcessingTimer();
    pointerPressedRef.current = false;
    updateCancelOnRelease(false);
    setErrorCode(null);
    setErrorMessage(null);
    setFallbackHint(null);
    setStatus("idle");
  }, [clearArmingTimer, clearProcessingTimer, updateCancelOnRelease]);

  const showCaptureError = useCallback(
    (nextErrorCode: string, nextErrorMessage?: string | null, tone: "error" | "warning" = "error") => {
      asyncFlowRef.current += 1;
      clearArmingTimer();
      clearProcessingTimer();
      pointerPressedRef.current = false;
      updateCancelOnRelease(false);
      setErrorCode(nextErrorCode);
      setErrorMessage(nextErrorMessage ?? buildRecorderErrorMessage(nextErrorCode));
      setStatus("error");

      const message = nextErrorMessage ?? buildRecorderErrorMessage(nextErrorCode);
      if (message) {
        if (tone === "warning") {
          toast.warning(message);
        } else {
          toast.error(message);
        }
      }
    },
    [clearArmingTimer, clearProcessingTimer, updateCancelOnRelease]
  );

  useEffect(() => {
    return () => {
      clearArmingTimer();
      clearProcessingTimer();
    };
  }, [clearArmingTimer, clearProcessingTimer]);

  const cancelCapture = useCallback(async () => {
    asyncFlowRef.current += 1;
    clearArmingTimer();
    clearProcessingTimer();
    pointerPressedRef.current = false;
    updateCancelOnRelease(false);

    if (recorder.isRecording || status === "requesting_permission") {
      await recorder.cancelRecording();
    }

    setErrorCode(null);
    setErrorMessage(null);
    setFallbackHint(null);
    setStatus("idle");
  }, [
    clearArmingTimer,
    clearProcessingTimer,
    recorder,
    status,
    updateCancelOnRelease,
  ]);

  useEffect(() => {
    if (previousPathRef.current === pathname) {
      return;
    }

    previousPathRef.current = pathname;

    if (
      status === "press_arming" ||
      status === "requesting_permission" ||
      status === "recording" ||
      status === "stopping" ||
      status === "uploading" ||
      status === "processing"
    ) {
      const timeoutId = window.setTimeout(() => {
        void cancelCapture();
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [cancelCapture, pathname, status]);

  useEffect(() => {
    const interruptionError = recorder.lastError;

    if (
      interruptionError !== "microphone_interrupted" &&
      interruptionError !== "voice_recorder_stream_error" &&
      interruptionError !== "voice_recorder_page_hidden"
    ) {
      return;
    }

    if (
      status === "recording" ||
      status === "requesting_permission" ||
      status === "stopping"
    ) {
      const timeoutId = window.setTimeout(() => {
        showCaptureError(interruptionError, buildRecorderErrorMessage(interruptionError), "warning");
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [recorder.lastError, showCaptureError, status]);

  const beginRecording = useCallback(
    async (trigger: "pointer" | "keyboard") => {
      if (disabled) {
        return;
      }

      const requestId = ++asyncFlowRef.current;
      const permissionStateBeforeStart = recorder.permissionState;
      clearArmingTimer();
      setErrorCode(null);
      setErrorMessage(null);
      setFallbackHint(null);
      setStatus("requesting_permission");

      try {
        const fileNameBase = `teacher-voice-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        await recorder.startRecording(fileNameBase);

        if (asyncFlowRef.current !== requestId) {
          await recorder.cancelRecording();
          return;
        }

        if (trigger === "pointer" && !pointerPressedRef.current) {
          await recorder.cancelRecording();
          updateCancelOnRelease(false);
          setStatus("idle");
          if (permissionStateBeforeStart !== "granted") {
            toast.message("麦克风已授权，请再长按一次开始录音。");
          }
          return;
        }

        setStatus("recording");
      } catch (error) {
        const nextErrorCode = error instanceof Error ? error.message : recorder.lastError;
        const nextError =
          buildRecorderErrorMessage(nextErrorCode) ?? "麦克风没有准备好，请重试。";
        setErrorCode(nextErrorCode ?? "voice_recorder_start_failed");
        setErrorMessage(nextError);
        setStatus("error");
        toast.error(nextError);
      }
    },
    [clearArmingTimer, disabled, recorder, updateCancelOnRelease]
  );

  const finishRecording = useCallback(async () => {
    if (!recorder.isRecording) {
      setStatus("idle");
      return;
    }

    updateCancelOnRelease(false);
    setStatus("stopping");

    try {
      const captureResult = await recorder.stopRecording();
      const requestId = ++asyncFlowRef.current;

      if (!captureResult) {
        setErrorCode("voice_capture_empty");
        setErrorMessage("没有采集到有效语音，请重试。");
        setStatus("error");
        toast.error("没有采集到有效语音，请重试。");
        return;
      }

      if (captureResult.durationMs < MIN_DURATION_MS) {
        setErrorCode(null);
        setStatus("too_short");
        toast.warning("录音太短，请至少说满 0.6 秒。");
        clearProcessingTimer();
        processingTimerRef.current = window.setTimeout(() => {
          if (asyncFlowRef.current !== requestId) return;
          setStatus("idle");
        }, 1200);
        return;
      }

      setStatus("uploading");

      const targetChildId = selectedResultChildId;
      const uploadResponse = await uploadTeacherVoiceCapture({
        file: captureResult.file,
        targetRole: "teacher",
        childId: targetChildId || undefined,
        scene: "teacher-global-fab",
        durationMs: captureResult.durationMs,
        mimeType: captureResult.mimeType,
      });

      if (asyncFlowRef.current !== requestId) {
        return;
      }

      if (uploadResponse.status === "failed") {
        const nextError =
          typeof uploadResponse.raw?.error === "string"
            ? uploadResponse.raw.error
            : "语音上传失败，请稍后重试。";
        setErrorCode("voice_upload_failed");
        setErrorMessage(nextError);
        setStatus("error");
        toast.error(nextError);
        return;
      }

      setResultChildId(targetChildId);
      setStatus("processing");
      const targetChild =
        visibleChildren.find((child) => child.id === targetChildId) ?? null;
      const processingStartedAt = Date.now();

      let nextResult: TeacherVoiceGlueResult = {
        upload: uploadResponse,
        understanding: null,
        understandingError: null,
        uiHintNextAction: uploadResponse.nextAction,
        recordingMeta: {
          durationMs: captureResult.durationMs,
          mimeType: captureResult.mimeType,
          fileName: captureResult.file.name,
          size: captureResult.size,
          scene: "teacher-global-fab",
        },
      };

      try {
        const understanding = await understandTeacherVoiceFromUpload({
          childId: targetChildId || undefined,
          childName: targetChild?.name,
          transcript: uploadResponse.transcript?.trim() || uploadResponse.draftContent.trim(),
          attachmentName: uploadResponse.attachmentName,
          mimeType: captureResult.mimeType,
          durationMs: captureResult.durationMs,
          scene: "teacher-global-fab",
          traceId: uploadResponse.assetId,
        });

        nextResult = {
          ...nextResult,
          understanding,
        };
      } catch (understandingError) {
        nextResult = {
          ...nextResult,
          understandingError:
            understandingError instanceof Error
              ? understandingError.message
              : "teacher_voice_understand_failed",
        };
      }

      const nextFallbackHint = buildFallbackNotice({
        uploadSource: nextResult.upload.source,
        understandingFallback: Boolean(nextResult.understanding?.trace.fallback),
      });
      setFallbackHint(nextFallbackHint);
      if (nextFallbackHint) {
        toast.warning(nextFallbackHint);
      }

      clearProcessingTimer();
      const remainingDelayMs = Math.max(
        0,
        PROCESSING_DELAY_MS - (Date.now() - processingStartedAt)
      );
      if (remainingDelayMs > 0) {
        await new Promise<void>((resolve) => {
          processingTimerRef.current = window.setTimeout(resolve, remainingDelayMs);
        });
      }

      if (asyncFlowRef.current !== requestId) {
        return;
      }

      setResult(nextResult);
      setStatus("success");
    } catch (error) {
      const nextError =
        error instanceof Error ? error.message : "语音上传失败，请稍后重试。";
      setErrorCode("voice_upload_failed");
      setErrorMessage(nextError);
      setStatus("error");
      toast.error(nextError);
    }
  }, [
    clearProcessingTimer,
    recorder,
    selectedResultChildId,
    updateCancelOnRelease,
    visibleChildren,
  ]);

  const handlePointerStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || effectiveStatus === "uploading" || effectiveStatus === "processing") {
        if (!isTeacherReady || visibleChildren.length === 0) {
          toast.message("当前教师账号没有可用于保存语音草稿的班级数据。");
        }
        return;
      }

      pointerPressedRef.current = true;
      event.preventDefault();
      updateCancelOnRelease(false);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore pointer capture errors on unsupported browsers.
      }

      setErrorCode(null);
      setErrorMessage(null);
      setFallbackHint(null);
      setStatus("press_arming");

      clearArmingTimer();
      armingTimerRef.current = window.setTimeout(() => {
        void beginRecording("pointer");
      }, LONG_PRESS_MS);
    },
    [
      beginRecording,
      clearArmingTimer,
      disabled,
      effectiveStatus,
      isTeacherReady,
      updateCancelOnRelease,
      visibleChildren.length,
    ]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!pointerPressedRef.current) {
        return;
      }

      if (
        effectiveStatus !== "press_arming" &&
        effectiveStatus !== "requesting_permission" &&
        effectiveStatus !== "recording"
      ) {
        if (cancelOnReleaseRef.current) {
          updateCancelOnRelease(false);
        }
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const nextCancelIntent =
        event.clientX < bounds.left - POINTER_CANCEL_MARGIN_PX ||
        event.clientX > bounds.right + POINTER_CANCEL_MARGIN_PX ||
        event.clientY < bounds.top - POINTER_CANCEL_MARGIN_PX ||
        event.clientY > bounds.bottom + POINTER_CANCEL_MARGIN_PX;

      if (nextCancelIntent !== cancelOnReleaseRef.current) {
        updateCancelOnRelease(nextCancelIntent);
      }
    },
    [effectiveStatus, updateCancelOnRelease]
  );

  const handlePointerEnd = useCallback(
    async (event: React.PointerEvent<HTMLButtonElement>) => {
      pointerPressedRef.current = false;

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore pointer release errors.
      }

      clearArmingTimer();

      if (effectiveStatus === "press_arming") {
        updateCancelOnRelease(false);
        setStatus("idle");
        return;
      }

      if (
        cancelOnReleaseRef.current &&
        (effectiveStatus === "requesting_permission" || effectiveStatus === "recording")
      ) {
        await cancelCapture();
        return;
      }

      if (effectiveStatus === "recording") {
        await finishRecording();
      }
    },
    [cancelCapture, clearArmingTimer, effectiveStatus, finishRecording, updateCancelOnRelease]
  );

  const handlePointerCancel = useCallback(
    async (event: React.PointerEvent<HTMLButtonElement>) => {
      pointerPressedRef.current = false;

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore pointer release errors.
      }

      clearArmingTimer();
      updateCancelOnRelease(false);

      if (effectiveStatus === "recording" || effectiveStatus === "requesting_permission") {
        await cancelCapture();
      } else if (effectiveStatus === "press_arming") {
        setStatus("idle");
      }
    },
    [cancelCapture, clearArmingTimer, effectiveStatus, updateCancelOnRelease]
  );

  const handleKeyboardToggle = useCallback(async () => {
    if (disabled || effectiveStatus === "uploading" || effectiveStatus === "processing") {
      return;
    }

    if (effectiveStatus === "recording") {
      await finishRecording();
      return;
    }

    await beginRecording("keyboard");
  }, [beginRecording, disabled, effectiveStatus, finishRecording]);

  const closeResult = useCallback(() => {
    setResult(null);
    resetToIdle();
  }, [resetToIdle]);

  const saveVoiceDraft = useCallback(
    (destination?: "teacher-agent" | "high-risk-consultation") => {
      if (!result) {
        return;
      }

      const targetChild = visibleChildren.find((child) => child.id === selectedResultChildId);
      if (!targetChild) {
        toast.error("请先选择一位幼儿，再保存语音草稿。");
        return;
      }

      const draft = buildVoiceDraftFromUpload({
        childId: targetChild.id,
        childName: targetChild.name,
        targetRole: "teacher",
        result,
      });

      saveMobileDraft(draft);
      markMobileDraftSyncStatus(draft.draftId, getVoiceDraftSyncStatus(result));

      toast.success(`已保存到 ${targetChild.name} 的教师语音草稿。`);
      closeResult();

      if (destination === "teacher-agent") {
        const searchParams = new URLSearchParams({
          childId: targetChild.id,
          draftId: draft.draftId,
          from: "voice-understanding",
        });
        router.push(`/teacher/agent?${searchParams.toString()}`);
      }

      if (destination === "high-risk-consultation") {
        router.push("/teacher/high-risk-consultation");
      }
    },
    [
      closeResult,
      markMobileDraftSyncStatus,
      result,
      selectedResultChildId,
      router,
      saveMobileDraft,
      visibleChildren,
    ]
  );

  if (!isTeacherReady) {
    return null;
  }

  const statusCopy = buildStatusHint({
    status: effectiveStatus,
    supportState: recorder.supportState,
    permissionState: recorder.permissionState,
    recorderErrorCode: errorCode,
    errorMessage,
    cancelOnRelease,
    fallbackHint,
  });

  return (
    <VoiceAssistantFAB
      status={effectiveStatus}
      durationMs={recorder.durationMs}
      statusLabel={statusCopy.label}
      statusHint={statusCopy.hint}
      degradedHint={fallbackHint}
      cancelOnRelease={cancelOnRelease}
      disabled={disabled}
      result={result}
      childOptions={childOptions}
      selectedChildId={selectedResultChildId}
      onSelectedChildChange={setResultChildId}
      onPointerStart={handlePointerStart}
      onPointerMove={handlePointerMove}
      onPointerEnd={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      onKeyboardToggle={handleKeyboardToggle}
      onRetry={resetToIdle}
      onCloseResult={closeResult}
      onSaveDraft={() => saveVoiceDraft()}
      onSaveAndContinue={
        result?.uiHintNextAction === "teacher-agent" ||
        result?.uiHintNextAction === "high-risk-consultation"
          ? saveVoiceDraft
          : undefined
      }
    />
  );
}
