"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTeacherVoiceFallbackMimeType,
  getTeacherVoiceMimeTypeCandidates,
  inferTeacherVoiceExtension,
  normalizeTeacherVoiceMimeType,
  type TeacherVoiceRecorderPlatform,
} from "@/lib/mobile/teacher-voice-audio";

export type VoiceRecorderSupportState = "checking" | "supported" | "unsupported";
export type VoiceRecorderPermissionState = "unknown" | "granted" | "denied";

export interface VoiceRecordingResult {
  blob: Blob;
  file: File;
  durationMs: number;
  mimeType: string;
  size: number;
}

function getRecorderPlatform(): TeacherVoiceRecorderPlatform {
  if (typeof navigator === "undefined") {
    return "default";
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  const isIosDevice =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Mac/i.test(platform) && maxTouchPoints > 1);

  return isIosDevice ? "ios-webkit" : "default";
}

function resolveSupportedMimeType(platform: TeacherVoiceRecorderPlatform) {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "";
  }

  const mediaRecorderConstructor = window.MediaRecorder;
  const supportedMimeType = getTeacherVoiceMimeTypeCandidates(platform).find((candidate) =>
    typeof mediaRecorderConstructor.isTypeSupported === "function"
      ? mediaRecorderConstructor.isTypeSupported(candidate)
      : false
  );

  return supportedMimeType ?? "";
}

function resolveNormalizedMimeType(params: {
  platform: TeacherVoiceRecorderPlatform;
  mimeType?: string;
  attachmentName?: string;
}) {
  return normalizeTeacherVoiceMimeType({
    mimeType: params.mimeType,
    attachmentName: params.attachmentName,
    fallbackMimeType: getTeacherVoiceFallbackMimeType(params.platform),
  });
}

function createRecordingFile(blob: Blob, fileNameBase: string, mimeType: string) {
  const safeFileNameBase = fileNameBase.trim() || "teacher-voice-note";
  const normalizedMimeType = normalizeTeacherVoiceMimeType({
    mimeType,
  });
  const extension = inferTeacherVoiceExtension(normalizedMimeType);

  return new File([blob], `${safeFileNameBase}.${extension}`, {
    type:
      normalizedMimeType ||
      normalizeTeacherVoiceMimeType({ mimeType: blob.type }) ||
      "audio/webm",
    lastModified: Date.now(),
  });
}

function toRecorderErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  ) {
    return "microphone_permission_denied";
  }

  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
  ) {
    return "microphone_not_found";
  }

  if (
    error instanceof DOMException &&
    (error.name === "NotReadableError" || error.name === "TrackStartError")
  ) {
    return "microphone_not_readable";
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "voice_recorder_aborted";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "voice_recorder_unknown_error";
}

function getInitialSupportState(): VoiceRecorderSupportState {
  if (typeof window === "undefined") {
    return "checking";
  }

  const isSupported =
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  return isSupported ? "supported" : "unsupported";
}

export function useVoiceRecorder() {
  const [recorderPlatform] = useState<TeacherVoiceRecorderPlatform>(() => getRecorderPlatform());
  const [supportState] = useState<VoiceRecorderSupportState>(getInitialSupportState);
  const [permissionState, setPermissionState] = useState<VoiceRecorderPermissionState>("unknown");
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [mimeType, setMimeType] = useState(() =>
    typeof window === "undefined"
      ? ""
      : resolveNormalizedMimeType({
          platform: recorderPlatform,
          mimeType: resolveSupportedMimeType(recorderPlatform),
        })
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pendingFileNameRef = useRef("teacher-voice-note");
  const stopResolverRef = useRef<((result: VoiceRecordingResult | null) => void) | null>(null);
  const discardOnStopRef = useRef(false);
  const cleanupTrackListenersRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearTrackListeners = useCallback(() => {
    cleanupTrackListenersRef.current?.();
    cleanupTrackListenersRef.current = null;
  }, []);

  const interruptRecording = useCallback(
    (reason: string) => {
      setLastError(reason);

      const activeRecorder = mediaRecorderRef.current;
      if (!activeRecorder || activeRecorder.state === "inactive") {
        return;
      }

      try {
        activeRecorder.stop();
      } catch {
        stopResolverRef.current?.(null);
        stopResolverRef.current = null;
        clearTrackListeners();
        clearTimer();
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        startedAtRef.current = 0;
        discardOnStopRef.current = false;
        setDurationMs(0);
        setIsRecording(false);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    },
    [clearTimer, clearTrackListeners]
  );

  const releaseMediaStream = useCallback(() => {
    clearTrackListeners();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, [clearTrackListeners]);

  const resetRecorderState = useCallback(() => {
    clearTimer();
    clearTrackListeners();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    discardOnStopRef.current = false;
    setDurationMs(0);
    setIsRecording(false);
    releaseMediaStream();
  }, [clearTimer, clearTrackListeners, releaseMediaStream]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        interruptRecording("voice_recorder_page_hidden");
      }
    };

    const handlePageHide = () => {
      interruptRecording("voice_recorder_page_hidden");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [interruptRecording]);

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore teardown stop errors.
        }
      }
      resetRecorderState();
    };
  }, [resetRecorderState]);

  const startRecording = useCallback(
    async (fileNameBase = "teacher-voice-note") => {
      if (supportState !== "supported") {
        throw new Error("voice_recorder_not_supported");
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        return;
      }

      pendingFileNameRef.current = fileNameBase;
      setLastError(null);
      chunksRef.current = [];
      discardOnStopRef.current = false;
      setDurationMs(0);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        setPermissionState("granted");

        const detachTrackListeners = () => {
          stream.getTracks().forEach((track) => {
            track.removeEventListener("ended", handleTrackEnded);
            track.removeEventListener("mute", handleTrackMuted);
          });
        };
        const handleTrackEnded = () => {
          interruptRecording("microphone_interrupted");
        };
        const handleTrackMuted = () => {
          interruptRecording("microphone_interrupted");
        };
        stream.getTracks().forEach((track) => {
          track.addEventListener("ended", handleTrackEnded);
          track.addEventListener("mute", handleTrackMuted);
        });
        cleanupTrackListenersRef.current = detachTrackListeners;

        const nextMimeType = resolveSupportedMimeType(recorderPlatform);
        const recorder = nextMimeType
          ? new MediaRecorder(stream, { mimeType: nextMimeType })
          : new MediaRecorder(stream);
        const fallbackMimeType = getTeacherVoiceFallbackMimeType(recorderPlatform);

        mediaRecorderRef.current = recorder;
        setMimeType(
          resolveNormalizedMimeType({
            platform: recorderPlatform,
            mimeType: recorder.mimeType || nextMimeType,
            attachmentName: `${fileNameBase}.${inferTeacherVoiceExtension(fallbackMimeType)}`,
          })
        );

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setLastError("voice_recorder_stream_error");
        };

        recorder.onstop = () => {
          const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : durationMs;
          const resolvedMimeType = resolveNormalizedMimeType({
            platform: recorderPlatform,
            mimeType: recorder.mimeType || nextMimeType || chunksRef.current[0]?.type,
            attachmentName: pendingFileNameRef.current,
          });
          const mergedBlob = new Blob(chunksRef.current, {
            type: resolvedMimeType || fallbackMimeType,
          });
          const shouldDiscard = discardOnStopRef.current || mergedBlob.size === 0;

          const result = shouldDiscard
            ? null
            : {
                blob: mergedBlob,
                file: createRecordingFile(
                  mergedBlob,
                  pendingFileNameRef.current,
                  resolvedMimeType || fallbackMimeType
                ),
                durationMs: elapsedMs,
                mimeType: resolveNormalizedMimeType({
                  platform: recorderPlatform,
                  mimeType: mergedBlob.type || recorder.mimeType || nextMimeType,
                  attachmentName: pendingFileNameRef.current,
                }),
                size: mergedBlob.size,
              } satisfies VoiceRecordingResult;

          stopResolverRef.current?.(result);
          stopResolverRef.current = null;
          resetRecorderState();
        };

        startedAtRef.current = Date.now();
        setIsRecording(true);
        recorder.start(200);

        timerRef.current = window.setInterval(() => {
          if (!startedAtRef.current) return;
          setDurationMs(Date.now() - startedAtRef.current);
        }, 120);
      } catch (error) {
        const nextError = toRecorderErrorMessage(error);
        if (nextError === "microphone_permission_denied") {
          setPermissionState("denied");
        }
        releaseMediaStream();
        setIsRecording(false);
        setLastError(nextError);
        throw new Error(nextError);
      }
    },
    [durationMs, interruptRecording, recorderPlatform, releaseMediaStream, resetRecorderState, supportState]
  );

  const stopRecording = useCallback(async () => {
    const activeRecorder = mediaRecorderRef.current;

    if (!activeRecorder || activeRecorder.state === "inactive") {
      return null;
    }

    return new Promise<VoiceRecordingResult | null>((resolve) => {
      stopResolverRef.current = resolve;

      try {
        activeRecorder.stop();
      } catch {
        stopResolverRef.current = null;
        resolve(null);
        resetRecorderState();
      }
    });
  }, [resetRecorderState]);

  const cancelRecording = useCallback(async () => {
    discardOnStopRef.current = true;
    return stopRecording();
  }, [stopRecording]);

  return {
    supportState,
    permissionState,
    isRecording,
    durationMs,
    mimeType,
    lastError,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
