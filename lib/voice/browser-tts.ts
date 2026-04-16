"use client";

export type BrowserTtsStatus = "idle" | "speaking" | "unsupported" | "error";

export interface BrowserTtsSupport {
  supported: boolean;
}

export interface ParentSpeechScriptSection {
  label?: string;
  text?: string | null;
}

export interface ParentSpeechScriptInput {
  title?: string;
  intro?: string;
  sections: ParentSpeechScriptSection[];
  outro?: string;
}

export interface SpeakBrowserTextOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStatusChange?: (status: BrowserTtsStatus) => void;
}

type ActiveSpeechSession = {
  id: number;
  onStatusChange?: (status: BrowserTtsStatus) => void;
};

let activeSpeechSession: ActiveSpeechSession | null = null;
let activeSpeechId = 0;

function normalizeSpeechText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getSpeechSynthesisApi() {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function resolvePreferredVoice() {
  const speech = getSpeechSynthesisApi();
  if (!speech) return null;

  const voices = speech.getVoices();
  if (voices.length === 0) return null;

  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ??
    voices.find((voice) => voice.default) ??
    voices[0] ??
    null
  );
}

function finalizeSpeechStatus(sessionId: number, status: BrowserTtsStatus) {
  if (activeSpeechSession?.id !== sessionId) return;
  const active = activeSpeechSession;
  activeSpeechSession = null;
  active?.onStatusChange?.(status);
}

export function getBrowserTtsSupport(): BrowserTtsSupport {
  const speech = getSpeechSynthesisApi();
  return {
    supported:
      typeof SpeechSynthesisUtterance !== "undefined" &&
      Boolean(speech && typeof speech.speak === "function" && typeof speech.cancel === "function"),
  };
}

export function stopBrowserTts() {
  const speech = getSpeechSynthesisApi();
  if (!speech) {
    activeSpeechSession?.onStatusChange?.("unsupported");
    activeSpeechSession = null;
    return;
  }

  const active = activeSpeechSession;
  activeSpeechSession = null;
  speech.cancel();
  active?.onStatusChange?.("idle");
}

export function speakBrowserText(options: SpeakBrowserTextOptions) {
  const support = getBrowserTtsSupport();
  if (!support.supported) {
    options.onStatusChange?.("unsupported");
    return false;
  }

  const nextText = normalizeSpeechText(options.text);
  if (!nextText) {
    options.onStatusChange?.("error");
    return false;
  }

  const speech = getSpeechSynthesisApi();
  if (!speech) {
    options.onStatusChange?.("unsupported");
    return false;
  }

  if (activeSpeechSession) {
    const previous = activeSpeechSession;
    activeSpeechSession = null;
    previous.onStatusChange?.("idle");
  }

  speech.cancel();

  const sessionId = ++activeSpeechId;
  const utterance = new SpeechSynthesisUtterance(nextText);
  const preferredVoice = resolvePreferredVoice();

  utterance.lang = options.lang ?? preferredVoice?.lang ?? "zh-CN";
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  activeSpeechSession = {
    id: sessionId,
    onStatusChange: options.onStatusChange,
  };

  utterance.onstart = () => {
    if (activeSpeechSession?.id !== sessionId) return;
    activeSpeechSession.onStatusChange?.("speaking");
  };
  utterance.onend = () => finalizeSpeechStatus(sessionId, "idle");
  utterance.onerror = () => finalizeSpeechStatus(sessionId, "error");

  speech.speak(utterance);
  return true;
}

export function buildParentSpeechScript(input: ParentSpeechScriptInput) {
  const segments = [
    input.title,
    input.intro,
    ...input.sections.map((section) => {
      const text = normalizeSpeechText(section.text ?? "");
      if (!text) return "";
      const label = normalizeSpeechText(section.label ?? "");
      return label ? `${label}\uff1a${text}` : text;
    }),
    input.outro,
  ]
    .map((item) => normalizeSpeechText(item ?? ""))
    .filter(Boolean);

  return segments.join("\u3002");
}
