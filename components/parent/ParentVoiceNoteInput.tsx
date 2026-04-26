"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/lib/mobile/use-voice-recorder";
import {
  createBrowserSpeechRecognizer,
  getBrowserSpeechInputSupport,
  type BrowserSpeechRecognizerController,
  type BrowserSpeechRecognizerStatus,
} from "@/lib/voice/browser-speech-input";

interface ParentVoiceNoteInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  careMode?: boolean;
  disabled?: boolean;
}

type LocalRecordingPreview = {
  durationMs: number;
  url: string;
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function mergeVoiceNote(currentValue: string, transcript: string) {
  const nextTranscript = transcript.trim();
  if (!nextTranscript) return currentValue;
  if (!currentValue.trim()) return nextTranscript;
  if (currentValue.includes(nextTranscript)) return currentValue;
  return `${currentValue.trim()}\n${nextTranscript}`;
}

function toRecorderMessage(errorCode: string | null) {
  switch (errorCode) {
    case "microphone_permission_denied":
      return "需要先打开麦克风权限，才能录一段补充语音。";
    case "microphone_not_found":
      return "当前设备没有可用麦克风。";
    case "microphone_not_readable":
      return "麦克风暂时不可用，请稍后再试。";
    case "voice_recorder_not_supported":
      return "当前浏览器暂不支持本地录音。";
    default:
      return "这次录音没有成功完成，请再试一次。";
  }
}

export default function ParentVoiceNoteInput({
  value,
  onChange,
  careMode = false,
  disabled = false,
}: ParentVoiceNoteInputProps) {
  const [support] = useState(() => getBrowserSpeechInputSupport());
  const [recognitionStatus, setRecognitionStatus] = useState<BrowserSpeechRecognizerStatus>(() =>
    support.recognitionSupported ? "idle" : "unsupported"
  );
  const [statusMessage, setStatusMessage] = useState(() => {
    if (support.recognitionSupported) {
      return "可以直接说话，识别结果会自动补到文字备注里。";
    }
    if (support.recordingSupported) {
      return "当前环境不能直接转文字，但仍可以先录一段语音，稍后人工补充。";
    }
    return "当前浏览器暂不支持语音输入。";
  });
  const [recordingPreview, setRecordingPreview] = useState<LocalRecordingPreview | null>(null);

  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const recognizerRef = useRef<BrowserSpeechRecognizerController | null>(null);
  const recorder = useVoiceRecorder();
  const displayStatusMessage = recorder.lastError ? toRecorderMessage(recorder.lastError) : statusMessage;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!support.recognitionSupported) return;

    const controller = createBrowserSpeechRecognizer({
      onStatusChange(nextStatus) {
        setRecognitionStatus(nextStatus);
        if (nextStatus === "listening") {
          setStatusMessage("正在听你说话，停止后会把识别结果补到备注里。");
          return;
        }
        if (nextStatus === "stopping") {
          setStatusMessage("正在整理刚才的语音内容。");
          return;
        }
        if (nextStatus === "idle") {
          setStatusMessage("可以直接说话，识别结果会自动补到文字备注里。");
        }
      },
      onResult(result) {
        const nextValue = mergeVoiceNote(valueRef.current, result.transcript);
        onChangeRef.current(nextValue);
        setStatusMessage("语音内容已经补到备注里，提交前记得顺手看一眼。");
      },
      onError(message) {
        setStatusMessage(message);
      },
    });

    recognizerRef.current = controller;

    return () => {
      controller.destroy();
      recognizerRef.current = null;
    };
  }, [support.recognitionSupported]);

  useEffect(() => {
    return () => {
      if (recordingPreview?.url) {
        URL.revokeObjectURL(recordingPreview.url);
      }
    };
  }, [recordingPreview]);

  async function handleSpeechToggle() {
    if (disabled || !support.recognitionSupported) return;
    const recognizer = recognizerRef.current;
    if (!recognizer?.supported) return;

    try {
      if (recognitionStatus === "listening") {
        recognizer.stop();
        return;
      }

      recognizer.start();
    } catch {
      setStatusMessage("这次没能开始收听，请再试一次。");
    }
  }

  async function handleRecordingToggle() {
    if (disabled || !support.recordingSupported) return;

    if (recorder.isRecording) {
      const result = await recorder.stopRecording();
      if (!result) {
        setStatusMessage("这次录音没有成功完成，请再试一次。");
        return;
      }

      if (recordingPreview?.url) {
        URL.revokeObjectURL(recordingPreview.url);
      }

      setRecordingPreview({
        durationMs: result.durationMs,
        url: URL.createObjectURL(result.blob),
      });
      setStatusMessage(
        `已保存一段 ${formatDuration(result.durationMs)} 的语音补充，仅在当前页面预览。`
      );
      return;
    }

    try {
      await recorder.startRecording("parent-voice-note");
      setStatusMessage("正在录音，这段语音只会留在当前页面里。");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? toRecorderMessage(error.message) : "这次录音没有成功完成，请再试一次。"
      );
    }
  }

  return (
    <div className="rounded-3xl border border-white/80 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">当前设备</Badge>
            {support.recognitionSupported ? (
              <Badge variant="secondary">语音转文字</Badge>
            ) : support.recordingSupported ? (
              <Badge variant="outline">语音补充</Badge>
            ) : (
              <Badge variant="warning">暂不支持</Badge>
            )}
          </div>
          <div>
            <p className={careMode ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>
              {"\u8bed\u97f3\u53cd\u9988"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              只在当前设备上处理，方便先把补充信息留下来。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {support.recognitionSupported ? (
            <Button
              type="button"
              variant={recognitionStatus === "listening" ? "secondary" : "outline"}
              className={careMode ? "min-h-11 rounded-2xl px-4 text-base" : "rounded-xl"}
              onClick={() => void handleSpeechToggle()}
              disabled={disabled}
            >
              {recognitionStatus === "listening" ? (
                <Square className="mr-2 h-4 w-4" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              {recognitionStatus === "listening" ? "\u505c\u6b62\u6536\u542c" : "\u8bf4\u7ed9\u6211\u542c"}
            </Button>
          ) : support.recordingSupported ? (
            <Button
              type="button"
              variant={recorder.isRecording ? "secondary" : "outline"}
              className={careMode ? "min-h-11 rounded-2xl px-4 text-base" : "rounded-xl"}
              onClick={() => void handleRecordingToggle()}
              disabled={disabled}
            >
              {recorder.isRecording ? (
                <Square className="mr-2 h-4 w-4" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              {recorder.isRecording ? "\u505c\u6b62\u5f55\u97f3" : "\u5f55\u4e00\u6bb5\u8bed\u97f3"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={careMode ? "min-h-11 rounded-2xl px-4 text-base" : "rounded-xl"}
              disabled
            >
              <Mic className="mr-2 h-4 w-4" />
              {"\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3"}
            </Button>
          )}
        </div>
      </div>

      <p className={careMode ? "mt-3 text-sm leading-7 text-slate-600" : "mt-3 text-sm leading-6 text-slate-600"}>
        {displayStatusMessage}
      </p>

      {recordingPreview ? (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">
            语音补充预览：{formatDuration(recordingPreview.durationMs)}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这段语音只保留在当前页面里，不会自动转成文字，也不会自动上传。
          </p>
          <audio controls src={recordingPreview.url} className="mt-3 w-full" />
        </div>
      ) : null}
    </div>
  );
}
