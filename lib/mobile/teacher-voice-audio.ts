export type TeacherVoiceScene = "teacher-global-fab";
export type TeacherVoiceRecorderPlatform = "default" | "ios-webkit";

const DEFAULT_FALLBACK_MIME_TYPE = "audio/webm";
const IOS_FALLBACK_MIME_TYPE = "audio/mp4";

const DEFAULT_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
] as const;

const IOS_MIME_TYPE_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mpeg",
] as const;

function normalizeExtension(extension?: string) {
  return extension?.trim().toLowerCase().replace(/^\./, "") || "";
}

function normalizeMimeValue(mimeType?: string) {
  return mimeType?.trim().toLowerCase() || "";
}

function normalizeMimeFromExtension(extension?: string) {
  const attachmentExtension = normalizeExtension(extension);

  if (attachmentExtension === "wav") return "audio/wav";
  if (attachmentExtension === "m4a" || attachmentExtension === "mp4" || attachmentExtension === "aac") {
    return "audio/mp4";
  }
  if (attachmentExtension === "mp3") return "audio/mpeg";
  if (attachmentExtension === "ogg" || attachmentExtension === "opus") return "audio/ogg";
  if (attachmentExtension === "pcm") return "audio/pcm";
  if (attachmentExtension === "webm") return "audio/webm";

  return "";
}

export function getTeacherVoiceFallbackMimeType(
  platform: TeacherVoiceRecorderPlatform = "default"
) {
  return platform === "ios-webkit" ? IOS_FALLBACK_MIME_TYPE : DEFAULT_FALLBACK_MIME_TYPE;
}

export function getTeacherVoiceMimeTypeCandidates(
  platform: TeacherVoiceRecorderPlatform = "default"
) {
  return platform === "ios-webkit"
    ? [...IOS_MIME_TYPE_CANDIDATES]
    : [...DEFAULT_MIME_TYPE_CANDIDATES];
}

export function normalizeTeacherVoiceMimeType(params: {
  mimeType?: string;
  attachmentName?: string;
  fallbackMimeType?: string;
}) {
  const normalizedMimeType = normalizeMimeValue(params.mimeType);

  if (
    normalizedMimeType.includes("wav") ||
    normalizedMimeType.includes("wave") ||
    normalizedMimeType.includes("x-wav")
  ) {
    return "audio/wav";
  }
  if (
    normalizedMimeType.includes("m4a") ||
    normalizedMimeType.includes("mp4") ||
    normalizedMimeType.includes("mp4a") ||
    normalizedMimeType.includes("aac")
  ) {
    return "audio/mp4";
  }
  if (normalizedMimeType.includes("mpeg") || normalizedMimeType.includes("mp3")) {
    return "audio/mpeg";
  }
  if (normalizedMimeType.includes("ogg") || normalizedMimeType.includes("opus")) {
    return "audio/ogg";
  }
  if (
    normalizedMimeType.includes("pcm") ||
    normalizedMimeType.includes("l16") ||
    normalizedMimeType.includes("raw")
  ) {
    return "audio/pcm";
  }
  if (normalizedMimeType.includes("webm")) return "audio/webm";
  if (normalizedMimeType.startsWith("audio/")) return normalizedMimeType;

  const fromAttachmentName = normalizeMimeFromExtension(params.attachmentName?.split(".").pop());
  if (fromAttachmentName) return fromAttachmentName;

  const fallbackMimeType = normalizeMimeValue(params.fallbackMimeType);
  if (fallbackMimeType) {
    return normalizeTeacherVoiceMimeType({ mimeType: fallbackMimeType });
  }

  return DEFAULT_FALLBACK_MIME_TYPE;
}

export function inferTeacherVoiceExtension(mimeType?: string) {
  const normalizedMimeType = normalizeTeacherVoiceMimeType({ mimeType });

  if (normalizedMimeType === "audio/wav") return "wav";
  if (normalizedMimeType === "audio/mp4") return "m4a";
  if (normalizedMimeType === "audio/mpeg") return "mp3";
  if (normalizedMimeType === "audio/ogg") return "ogg";
  if (normalizedMimeType === "audio/pcm") return "pcm";
  return "webm";
}
