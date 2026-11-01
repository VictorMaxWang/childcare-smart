"use client";

export type BrowserSpeechRecognizerStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "stopping"
  | "success"
  | "error"
  | "unsupported";

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export interface BrowserSpeechInputSupport {
  recognitionSupported: boolean;
  recordingSupported: boolean;
  recognitionKind: "speech-recognition" | "webkit-speech-recognition" | null;
}

export interface BrowserSpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export interface CreateBrowserSpeechRecognizerOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onStatusChange?: (status: BrowserSpeechRecognizerStatus) => void;
  onResult?: (result: BrowserSpeechRecognitionResult) => void;
  onError?: (message: string) => void;
}

export interface BrowserSpeechRecognizerController {
  supported: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  destroy: () => void;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResultList extends ArrayLike<BrowserSpeechRecognitionResultListItem> {
  [index: number]: BrowserSpeechRecognitionResultListItem;
}

interface BrowserSpeechRecognitionResultListItem extends ArrayLike<BrowserSpeechRecognitionAlternative> {
  [index: number]: BrowserSpeechRecognitionAlternative;
  isFinal: boolean;
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex?: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  if (window.SpeechRecognition) {
    return {
      constructor: window.SpeechRecognition,
      kind: "speech-recognition" as const,
    };
  }

  if (window.webkitSpeechRecognition) {
    return {
      constructor: window.webkitSpeechRecognition,
      kind: "webkit-speech-recognition" as const,
    };
  }

  return null;
}

function normalizeSpeechRecognitionError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "需要先允许麦克风权限，才能使用语音转文字。";
    case "audio-capture":
      return "当前浏览器暂时无法采集麦克风声音。";
    case "network":
      return "语音转文字暂时不可用，请稍后再试。";
    case "no-speech":
      return "没有识别到清晰语音，请再说一次。";
    case "aborted":
      return "本次语音转文字已取消。";
    default:
      return "这次语音转文字没有顺利完成，请稍后重试。";
  }
}

function readSpeechRecognitionTranscript(event: BrowserSpeechRecognitionEvent) {
  const startIndex = event.resultIndex ?? 0;
  let finalTranscript = "";
  let latestTranscript = "";

  for (let index = startIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim() ?? "";
    if (!transcript) continue;
    latestTranscript = transcript;
    if (result.isFinal) {
      finalTranscript += `${transcript} `;
    }
  }

  return {
    transcript: (finalTranscript || latestTranscript).trim(),
    isFinal: Boolean(finalTranscript.trim()),
  };
}

export function getBrowserSpeechInputSupport(): BrowserSpeechInputSupport {
  const recognitionApi = getSpeechRecognitionConstructor();
  const recordingSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  return {
    recognitionSupported: Boolean(recognitionApi),
    recordingSupported,
    recognitionKind: recognitionApi?.kind ?? null,
  };
}

export function createBrowserSpeechRecognizer(
  options: CreateBrowserSpeechRecognizerOptions = {}
): BrowserSpeechRecognizerController {
  const recognitionApi = getSpeechRecognitionConstructor();
  if (!recognitionApi) {
    options.onStatusChange?.("unsupported");
    return {
      supported: false,
      start() {
        options.onStatusChange?.("unsupported");
      },
      stop() {
        options.onStatusChange?.("unsupported");
      },
      abort() {
        options.onStatusChange?.("unsupported");
      },
      destroy() {},
    };
  }

  let recognition: BrowserSpeechRecognition | null = null;
  let phase: "idle" | "requesting" | "listening" | "stopping" = "idle";
  let generation = 0;
  let destroyed = false;

  const retire = (abort: boolean) => {
    const previous = recognition;
    recognition = null;
    phase = "idle";
    generation += 1;
    if (!previous) return;
    previous.onstart = previous.onend = previous.onresult = previous.onerror = null;
    if (abort) { try { previous.abort(); } catch { /* 已结束的原生会话不影响清理。 */ } }
  };
  const fail = (message: string) => {
    retire(true);
    options.onStatusChange?.("error");
    options.onError?.(message);
  };
  const startupError = (error: unknown) => {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    return name === "NotAllowedError"
      ? normalizeSpeechRecognitionError("not-allowed")
      : "这次没能开始语音输入，请检查麦克风权限后重试。";
  };

  return {
    supported: true,
    start() {
      if (destroyed || phase !== "idle") return;
      // 原生onstart可能在权限弹窗关闭后才触发；同步锁住请求，不能等React重渲染防重。
      phase = "requesting";
      const currentGeneration = ++generation;
      options.onStatusChange?.("requesting");
      if (destroyed || currentGeneration !== generation) return;
      try {
        const next = new recognitionApi.constructor();
        recognition = next;
        next.lang = options.lang ?? "zh-CN";
        next.continuous = options.continuous ?? false;
        next.interimResults = options.interimResults ?? false;
        next.maxAlternatives = options.maxAlternatives ?? 1;
        const isCurrent = () => !destroyed && currentGeneration === generation && recognition === next;
        next.onstart = () => {
          if (!isCurrent()) return;
          phase = "listening";
          options.onStatusChange?.("listening");
        };
        next.onend = () => {
          if (!isCurrent()) return;
          retire(false);
          options.onStatusChange?.("idle");
        };
        next.onresult = (event) => {
          if (!isCurrent()) return;
          const result = readSpeechRecognitionTranscript(event);
          if (!result.transcript) return;
          options.onStatusChange?.(result.isFinal ? "success" : "listening");
          options.onResult?.(result);
        };
        next.onerror = (event) => {
          if (isCurrent()) fail(normalizeSpeechRecognitionError(event.error));
        };
        next.start();
      } catch (error) {
        if (!destroyed && currentGeneration === generation) fail(startupError(error));
      }
    },
    stop() {
      if (destroyed || phase === "idle" || phase === "stopping") return;
      phase = "stopping";
      options.onStatusChange?.("stopping");
      try { recognition?.stop(); } catch (error) { fail(startupError(error)); }
    },
    abort() {
      if (destroyed) return;
      retire(true);
      options.onStatusChange?.("idle");
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      retire(true);
    },
  };
}
