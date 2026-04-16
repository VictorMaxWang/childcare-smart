"use client";

export type BrowserSpeechRecognizerStatus =
  | "idle"
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

  const recognition = new recognitionApi.constructor();

  recognition.lang = options.lang ?? "zh-CN";
  recognition.continuous = options.continuous ?? false;
  recognition.interimResults = options.interimResults ?? false;
  recognition.maxAlternatives = options.maxAlternatives ?? 1;

  recognition.onstart = () => {
    options.onStatusChange?.("listening");
  };
  recognition.onend = () => {
    options.onStatusChange?.("idle");
  };
  recognition.onresult = (event) => {
    const nextResult = readSpeechRecognitionTranscript(event);
    if (!nextResult.transcript) return;
    options.onResult?.(nextResult);
    options.onStatusChange?.(nextResult.isFinal ? "success" : "listening");
  };
  recognition.onerror = (event) => {
    options.onStatusChange?.("error");
    options.onError?.(normalizeSpeechRecognitionError(event.error));
  };

  return {
    supported: true,
    start() {
      recognition.start();
    },
    stop() {
      options.onStatusChange?.("stopping");
      recognition.stop();
    },
    abort() {
      recognition.abort();
    },
    destroy() {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
    },
  };
}
