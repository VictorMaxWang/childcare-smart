"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import {
  executeVoiceAssistantCommand,
  getVoiceAssistantProviderStatus,
  planVoiceAssistantCommand,
  transcribeVoiceAssistantAudio,
} from "@/lib/api/voice-assistant";
import {
  createBrowserSpeechRecognizer,
  getBrowserSpeechInputSupport,
  type BrowserSpeechInputSupport,
  type BrowserSpeechRecognizerController,
  type BrowserSpeechRecognizerStatus,
} from "@/lib/voice/browser-speech-input";
import { accountRoleToAssistantRole, ROLE_ASSISTANT_NAMES, ROLE_EXAMPLES } from "@/lib/voice-assistant/intents";
import { readAssistantHistory, saveAssistantHistoryItem } from "@/lib/voice-assistant/history";
import type {
  AssistantCommand,
  AssistantExecuteResult,
  AssistantHistoryItem,
  AssistantObjectRefs,
  AssistantProviderStatus,
  AssistantUtterance,
} from "@/lib/voice-assistant/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type VoiceOrbPhase = "idle" | "planning" | "awaiting-confirmation" | "executing" | "done" | "error";

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "语音助手处理失败。";
}

function historyStatusFromResult(result: AssistantExecuteResult | null, command: AssistantCommand | null) {
  return result?.command.status ?? command?.status ?? "failed";
}

function buildQueryObject(searchParams: URLSearchParams) {
  const query: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

type VoiceResultAction =
  | {
      kind: "download";
      filename: string;
      mimeType: string;
      content: string;
    }
  | {
      kind: "share-text";
      summary?: string;
      localText: string;
      copyText: string;
      note?: string;
    };

function resultActionFrom(result: AssistantExecuteResult | null): VoiceResultAction | null {
  if (!result) return null;
  if (result.download?.content) {
    return {
      kind: "download",
      filename: result.download.filename,
      mimeType: result.download.mimeType,
      content: result.download.content,
    };
  }
  if (result.shareText) {
    return {
      kind: "share-text",
      localText: result.shareText,
      copyText: result.shareText,
    };
  }
  const data = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? (result.data as Record<string, unknown>)
    : null;
  if (data?.kind === "download" && typeof data.content === "string") {
    return {
      kind: "download",
      filename: typeof data.filename === "string" ? data.filename : "voice-assistant-export.txt",
      mimeType: typeof data.mimeType === "string" ? data.mimeType : "text/plain",
      content: data.content,
    };
  }
  if (data?.kind === "share-text") {
    const copyText =
      (typeof data.copyText === "string" && data.copyText) ||
      (typeof data.localText === "string" && data.localText) ||
      "";
    if (!copyText) return null;
    return {
      kind: "share-text",
      summary: typeof data.summary === "string" ? data.summary : undefined,
      localText: typeof data.localText === "string" ? data.localText : copyText,
      copyText,
      note: typeof data.note === "string" ? data.note : undefined,
    };
  }
  return null;
}

function cleanRefs(refs: AssistantObjectRefs): AssistantObjectRefs {
  return Object.fromEntries(Object.entries(refs).filter(([, value]) => typeof value === "string" && value)) as AssistantObjectRefs;
}

function triggerDownload(download: NonNullable<AssistantExecuteResult["download"]>) {
  const blob = new Blob([download.content], { type: download.mimeType || "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export function VoiceOrb() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser, visibleChildren, reloadAppSnapshotFromApi } = useApp();
  const role = accountRoleToAssistantRole(currentUser.role);
  const examples = ROLE_EXAMPLES[role];
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [text, setText] = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [phase, setPhase] = useState<VoiceOrbPhase>("idle");
  const [command, setCommand] = useState<AssistantCommand | null>(null);
  const [result, setResult] = useState<AssistantExecuteResult | null>(null);
  const [resultActionStatus, setResultActionStatus] = useState("");
  const [error, setError] = useState("");
  const [providerStatus, setProviderStatus] = useState<AssistantProviderStatus | null>(null);
  const [speechSupport, setSpeechSupport] = useState<BrowserSpeechInputSupport | null>(null);
  const [speechStatus, setSpeechStatus] = useState<BrowserSpeechRecognizerStatus>("idle");
  const [historyItems, setHistoryItems] = useState<AssistantHistoryItem[]>([]);
  const [objectRefs, setObjectRefs] = useState<AssistantObjectRefs>({});
  const recognizerRef = useRef<BrowserSpeechRecognizerController | null>(null);
  const submitTextRef = useRef<((value: string, inputMode: AssistantUtterance["inputMode"]) => Promise<void>) | null>(
    null
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);

  const queryObject = useMemo(() => buildQueryObject(searchParams), [searchParams]);
  const currentPath = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const activeChildId = queryObject.childId ?? queryObject.child ?? currentUser.childIds?.[0] ?? visibleChildren[0]?.id;
  const resultAction = useMemo(() => resultActionFrom(result), [result]);
  const commandObjects = useMemo(
    () =>
      cleanRefs({
        ...(queryObject as AssistantObjectRefs),
        ...objectRefs,
        childId: activeChildId ?? objectRefs.childId,
      }),
    [activeChildId, objectRefs, queryObject]
  );
  const currentObjects = useMemo<Record<string, string | undefined> | undefined>(
    () => (Object.keys(commandObjects).length > 0 ? { ...commandObjects } : undefined),
    [commandObjects]
  );

  const providerText = useMemo(() => {
    if (!providerStatus) return "正在读取 provider 状态";
    const unavailable = [providerStatus.chat, providerStatus.ocr, providerStatus.asr, providerStatus.tts].find(
      (capability) => !capability.configured || capability.status !== "ready"
    );
    if (unavailable) return providerStatus.fallbackText;
    return "vivo provider ready";
  }, [providerStatus]);

  const speechHint = useMemo(() => {
    if (!speechSupport) return "正在检测语音能力";
    if (speechSupport.recognitionSupported) return "浏览器语音识别可用";
    if (speechSupport.recordingSupported) return "浏览器语音识别不可用，可尝试 ASR provider 或输入文字指令";
    return "当前浏览器无语音能力，可输入文字指令";
  }, [speechSupport]);

  const persistHistory = useCallback(
    (item: AssistantHistoryItem) => {
      setHistoryItems(saveAssistantHistoryItem(role, currentUser.id, item));
    },
    [currentUser.id, role]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHistoryItems(readAssistantHistory(role, currentUser.id));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentUser.id, role]);

  useEffect(() => {
    const openVoiceOrb = () => {
      setExpanded(true);
      setMinimized(false);
    };
    window.addEventListener("smartchildcare:open-voice-orb", openVoiceOrb);
    return () => window.removeEventListener("smartchildcare:open-voice-orb", openVoiceOrb);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSpeechSupport(getBrowserSpeechInputSupport());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getVoiceAssistantProviderStatus()
      .then((status) => {
        if (!cancelled) setProviderStatus(status);
      })
      .catch((err) => {
        if (!cancelled) {
          setProviderStatus(null);
          setError(`provider 状态读取失败：${errorMessage(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!speechSupport?.recognitionSupported) return;
    const recognizer = createBrowserSpeechRecognizer({
      lang: "zh-CN",
      interimResults: true,
      onStatusChange: setSpeechStatus,
      onError(message) {
        setError(message);
        setPhase("error");
      },
      onResult(result) {
        setRecognizedText(result.transcript);
        setText(result.transcript);
        if (result.isFinal) {
          void submitTextRef.current?.(result.transcript, "browser-speech");
        }
      },
    });
    recognizerRef.current = recognizer;
    return () => {
      recognizer.destroy();
      recognizerRef.current = null;
    };
  }, [speechSupport?.recognitionSupported]);

  const executeCommand = useCallback(
    async (nextCommand: AssistantCommand, confirmed = false) => {
      setPhase("executing");
      setError("");
      setResultActionStatus("");
      try {
        const executed = await executeVoiceAssistantCommand({
          command: nextCommand,
          confirmed,
          currentPath,
          currentQuery: queryObject,
          objects: currentObjects,
        });
        setResult(executed);
        setCommand(executed.command);
        if (executed.refs) {
          setObjectRefs((prev) => cleanRefs({ ...prev, ...executed.refs }));
        }
        setPhase("done");
        persistHistory({
          id: executed.command.id,
          role,
          commandText: executed.command.utterance?.text ?? text,
          intent: executed.command.intent,
          status: historyStatusFromResult(executed, nextCommand),
          resultText: executed.message,
          createdAt: new Date().toISOString(),
        });
        if (executed.deeplink) {
          router.push(executed.deeplink);
        }
        if (executed.download) {
          triggerDownload(executed.download);
        }
        if (executed.shareText && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(executed.shareText);
          } catch {
            setError("分享文案已生成，但浏览器未允许复制到剪贴板。");
          }
        }
        if (executed.refreshed) {
          await reloadAppSnapshotFromApi();
          router.refresh();
        }
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        setPhase("error");
        persistHistory({
          id: nextCommand.id,
          role,
          commandText: nextCommand.utterance?.text ?? text,
          intent: nextCommand.intent,
          status: "failed",
          errorText: message,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [currentObjects, currentPath, persistHistory, queryObject, reloadAppSnapshotFromApi, role, router, text]
  );

  const submitText = useCallback(
    async (value: string, inputMode: AssistantUtterance["inputMode"] = "text") => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setExpanded(true);
      setMinimized(false);
      setPhase("planning");
      setError("");
      setResultActionStatus("");
      setResult(null);
      setCommand(null);
      const utterance: AssistantUtterance = {
        text: trimmed,
        inputMode,
        transcriptSource: inputMode === "browser-speech" ? "browser-speech-recognition" : "text-fallback",
      };

      try {
        const planned = await planVoiceAssistantCommand({
          utterance,
          currentPath,
          currentQuery: queryObject,
          objects: currentObjects,
        });
        setProviderStatus(planned.providerStatus ?? providerStatus);
        setCommand(planned.command);

        if (planned.command.status === "ready" && !planned.command.requiredConfirmation) {
          await executeCommand(planned.command, true);
          return;
        }

        if (planned.command.status === "needs_confirmation") {
          setPhase("awaiting-confirmation");
          return;
        }

        if (planned.command.status === "unknown" || planned.command.status === "forbidden" || planned.command.status === "unsupported") {
          setError(planned.command.previewText);
          setPhase("error");
          persistHistory({
            id: planned.command.id,
            role,
            commandText: trimmed,
            intent: planned.command.intent,
            status: planned.command.status,
            errorText: planned.command.previewText,
            createdAt: new Date().toISOString(),
          });
          return;
        }

        if (planned.command.status === "needs_params") {
          setError(planned.command.previewText);
          setPhase("error");
          return;
        }

        setPhase("idle");
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        setPhase("error");
      }
    },
    [currentObjects, currentPath, executeCommand, persistHistory, providerStatus, queryObject, role]
  );

  useEffect(() => {
    submitTextRef.current = submitText;
  }, [submitText]);

  async function handleSubmit() {
    await submitText(text, "text");
  }

  async function startProviderRecording() {
    if (!speechSupport?.recordingSupported) {
      setError("当前浏览器无法录音，可输入文字指令。");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const formData = new FormData();
        formData.set("audio", new File([audio], "voice-orb.webm", { type: audio.type || "audio/webm" }));
        formData.set("durationMs", String(Date.now() - recordingStartedAtRef.current));
        formData.set("mimeType", audio.type || "audio/webm");
        formData.set("scene", "voice-orb");
        if (activeChildId) formData.set("childId", activeChildId);
        setPhase("planning");
        setError("");
        try {
          const asr = await transcribeVoiceAssistantAudio(formData);
          const transcript = asr.transcript.trim();
          if (!transcript) {
            setError("ASR provider 没有返回可用转写，请使用文字 fallback。");
            setPhase("error");
            return;
          }
          setRecognizedText(transcript);
          setText(transcript);
          await submitText(transcript, "asr-provider");
        } catch (err) {
          setError(errorMessage(err));
          setPhase("error");
        }
      };
      recorder.start();
      setSpeechStatus("listening");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("error");
    }
  }

  function stopProviderRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setSpeechStatus("stopping");
  }

  async function handleVoiceButton() {
    setExpanded(true);
    setMinimized(false);
    if (speechSupport?.recognitionSupported && recognizerRef.current?.supported) {
      if (speechStatus === "listening") {
        recognizerRef.current.stop();
      } else {
        setRecognizedText("");
        setError("");
        recognizerRef.current.start();
      }
      return;
    }

    if (speechStatus === "listening" && recorderRef.current) {
      stopProviderRecording();
      return;
    }

    await startProviderRecording();
  }

  function downloadResultAction(action: Extract<VoiceResultAction, { kind: "download" }>) {
    try {
      const blob = new Blob([action.content], { type: action.mimeType || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = action.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setResultActionStatus(`已生成下载文件：${action.filename}`);
    } catch (downloadError) {
      setResultActionStatus(downloadError instanceof Error ? downloadError.message : "下载文件生成失败。");
    }
  }

  async function copyResultAction(action: Extract<VoiceResultAction, { kind: "share-text" }>) {
    try {
      await navigator.clipboard.writeText(action.copyText);
      setResultActionStatus("分享文案已复制。");
    } catch (copyError) {
      setResultActionStatus(copyError instanceof Error ? copyError.message : "复制分享文案失败。");
    }
  }

  function cancelCommand() {
    if (command) {
      persistHistory({
        id: command.id,
        role,
        commandText: command.utterance?.text ?? text,
        intent: command.intent,
        status: "cancelled",
        resultText: "用户取消执行。",
        createdAt: new Date().toISOString(),
      });
    }
    setCommand((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    setPhase("idle");
    setError("");
  }

  const isBusy = phase === "planning" || phase === "executing";
  const isListening = speechStatus === "listening";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.9rem)] z-[60] flex flex-col items-end gap-3 px-3 sm:bottom-6 sm:right-6 sm:left-auto sm:block sm:px-0">
      {expanded && !minimized ? (
        <section
          className="pointer-events-auto mb-3 w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_70px_rgb(15_23_42_/_0.18)] sm:mb-4"
          data-testid="voice-orb-panel"
          aria-label="语音球助手"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-950">{ROLE_ASSISTANT_NAMES[role]}</h2>
                  <p className="truncate text-xs text-slate-500">{speechHint}</p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMinimized(true)}
                aria-label="最小化语音助手"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => {
                  setExpanded(false);
                  setMinimized(false);
                }}
                aria-label="关闭语音助手"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(72vh,640px)] space-y-3 overflow-y-auto px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  providerStatus &&
                  [providerStatus.chat, providerStatus.ocr, providerStatus.asr, providerStatus.tts].every(
                    (capability) => capability.configured
                  )
                    ? "success"
                    : "warning"
                }
                data-testid="voice-orb-provider-status"
              >
                {providerText}
              </Badge>
              {!speechSupport?.recognitionSupported ? <Badge variant="neutral">可输入文字指令</Badge> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  onClick={() => {
                    setText(example);
                    void submitText(example, "text");
                  }}
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Textarea
                data-testid="voice-orb-input"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="输入文字指令，例如：打开成长档案"
                className="min-h-[84px] rounded-xl text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? "danger" : "outline"}
                  onClick={handleVoiceButton}
                  aria-label={isListening ? "停止语音输入" : "开始语音输入"}
                  title={isListening ? "停止语音输入" : "开始语音输入"}
                >
                  {isListening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-2"
                  onClick={handleSubmit}
                  loading={isBusy}
                  data-testid="voice-orb-submit"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  解析指令
                </Button>
              </div>
            </div>

            {recognizedText ? (
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <p className="text-xs font-semibold text-sky-700">识别文本</p>
                <p className="mt-1">{recognizedText}</p>
              </div>
            ) : null}

            {command ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" data-testid="voice-orb-plan">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">执行计划</p>
                  <Badge variant={command.safetyLevel === "safe" ? "success" : command.safetyLevel === "write" ? "warning" : "danger"}>
                    {command.safetyLevel}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950">{command.previewText}</p>
                {command.missingParams.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">缺少参数：{command.missingParams.join("、")}</p>
                ) : null}
                {command.riskText ? <p className="mt-2 text-xs text-rose-700">{command.riskText}</p> : null}
                {phase === "awaiting-confirmation" ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      className="flex-1 gap-2"
                      onClick={() => command && executeCommand(command, true)}
                      data-testid="voice-orb-confirm"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      确认执行
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={cancelCommand}
                      data-testid="voice-orb-cancel"
                    >
                      <Square className="h-4 w-4" aria-hidden="true" />
                      取消
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-900" data-testid="voice-orb-result">
                <p className="font-semibold">{result.message}</p>
                {resultAction?.kind === "download" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
                      onClick={() => downloadResultAction(resultAction)}
                      data-testid="voice-orb-download"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      下载导出文件
                    </Button>
                    <span className="text-xs text-emerald-700">{resultAction.filename}</span>
                  </div>
                ) : null}
                {resultAction?.kind === "share-text" ? (
                  <div className="mt-3 space-y-2">
                    {resultAction.summary ? <p className="text-xs text-emerald-700">{resultAction.summary}</p> : null}
                    <div
                      className="max-h-28 overflow-y-auto rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-700"
                      data-testid="voice-orb-share-text"
                    >
                      {resultAction.localText}
                    </div>
                    {resultAction.note ? <p className="text-xs text-emerald-700">{resultAction.note}</p> : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
                      onClick={() => void copyResultAction(resultAction)}
                      data-testid="voice-orb-copy-share"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      复制分享文案
                    </Button>
                  </div>
                ) : null}
                {resultActionStatus ? <p className="mt-2 text-xs text-emerald-700">{resultActionStatus}</p> : null}
                {result.links?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.links.map((link) => (
                      <Button
                        type="button"
                        key={`${link.href}-${link.label}`}
                        size="sm"
                        variant="outline"
                        className="h-8 border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100"
                        data-testid="voice-orb-result-link"
                        onClick={() => router.push(link.href)}
                      >
                        {link.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm text-rose-900" data-testid="voice-orb-error">
                <p className="font-semibold">{error}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {examples.slice(0, 3).map((example) => (
                    <span key={example} className="rounded-full bg-white px-2 py-1 text-xs text-rose-700">
                      {example}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {historyItems.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  命令历史
                </div>
                <div className="mt-2 space-y-2">
                  {historyItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex items-start gap-2 text-xs">
                      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{item.commandText}</p>
                        <p className={cn("truncate", item.errorText ? "text-rose-600" : "text-slate-500")}>
                          {item.errorText ?? item.resultText ?? item.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setMinimized(false);
        }}
        className={cn(
          "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_42px_rgb(15_23_42_/_0.28)] ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200",
          expanded && !minimized ? "sm:ml-auto" : ""
        )}
        data-testid="voice-orb-button"
        aria-label="打开语音球助手"
        title="语音球助手"
      >
        {phase === "planning" || phase === "executing" ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
