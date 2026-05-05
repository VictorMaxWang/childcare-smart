import "server-only";

export type VivoCapability = "chat" | "ocr" | "asr";

export type VivoProviderRuntimeStatus =
  | "ready"
  | "missing-env"
  | "unsupported"
  | "provider-unavailable"
  | "error";

export interface VivoProviderStatus {
  providerName: "vivo";
  capability: VivoCapability;
  configured: boolean;
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
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  requestId: string;
  status: VivoProviderStatus;
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
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  requestId?: string;
  status: VivoProviderStatus;
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
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  segments?: VivoAsrSegment[];
  requestId?: string;
  status: VivoProviderStatus;
  model?: string;
}
