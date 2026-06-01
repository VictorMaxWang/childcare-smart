import "server-only";

export type VivoCapability = "chat" | "ocr" | "asr" | "tts";
export type VivoProviderState = "configured" | "live" | "fallback" | "mock";

export type VivoProviderRuntimeStatus =
  | "ready"
  | "missing-env"
  | "unsupported"
  | "provider-unavailable"
  | "error";

export interface VivoProviderStatus<TCapability extends VivoCapability = VivoCapability> {
  [key: string]: unknown;
  providerName: string;
  capability: TCapability;
  state: VivoProviderState;
  configured: boolean;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  supported: boolean;
  isRealProvider: boolean;
  status: VivoProviderRuntimeStatus;
  reason?: string;
  warnings: string[];
  requiredEnv: string[];
}

export interface VivoChatMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string | Array<Record<string, unknown>>;
}

export interface VivoChatInput {
  messages: VivoChatMessage[];
  model?: string;
  requestId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  taskType?: string;
}

export interface VivoChatResult {
  text: string;
  providerName: "vivo";
  model: string;
  state: VivoProviderState;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  requestId: string;
  status: VivoProviderStatus<"chat">;
}

export interface VivoOcrInput {
  attachmentName?: string;
  mimeType?: string;
  imageBase64?: string;
  fallbackText?: string;
  requestId?: string;
}

export interface VivoOcrResult {
  extractedText: string;
  confidence: number | null;
  providerName: "vivo";
  state: VivoProviderState;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  requestId?: string;
  status: VivoProviderStatus<"ocr">;
}

export interface VivoAsrInput {
  attachmentName?: string;
  mimeType?: string;
  audioBytes?: ArrayBuffer | Uint8Array | Buffer;
  transcript?: string;
  fallbackText?: string;
  durationMs?: number;
  scene?: string;
  requestId?: string;
}

export interface VivoAsrSegment {
  text: string;
  bg?: number;
  ed?: number;
  speaker?: number;
}

export interface VivoAsrResult {
  transcript: string;
  confidence: number | null;
  providerName: "vivo";
  state: VivoProviderState;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  segments?: VivoAsrSegment[];
  requestId?: string;
  status: VivoProviderStatus<"asr">;
  model?: string;
}

export interface VivoTtsInput {
  text: string;
  childId?: string;
  storyId?: string;
  page?: number;
  voiceStyle?: string;
  requestId?: string;
}

export interface VivoTtsResult {
  audioBytes: Buffer;
  audioContentType: "audio/wav";
  providerName: "vivo";
  state: VivoProviderState;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  engineId: string;
  voiceName: string;
  requestId: string;
  isRealProvider: boolean;
  status: VivoProviderStatus<"tts">;
  warnings: string[];
}
