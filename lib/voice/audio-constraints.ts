export const VOICE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_AUDIO_MAX_DURATION_MS = 90_000;
export const VOICE_TRANSCRIPT_MAX_LENGTH = 10_000;

export function validateVoiceAudioFile(file: File) {
  if (file.size <= 0) return "录音文件为空，请重新录制。";
  if (file.size > VOICE_AUDIO_MAX_BYTES) {
    return "录音文件超过 4 MB，请缩短后重新录制。";
  }
  if (!file.type.toLowerCase().startsWith("audio/")) {
    return "录音必须是有效的音频文件。";
  }
  return null;
}

export function validateVoiceDuration(value?: number) {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > VOICE_AUDIO_MAX_DURATION_MS) {
    return "单次录音最长 90 秒。";
  }
  return null;
}

export function validateVoiceText(value?: string) {
  if (!value) return null;
  return value.length <= VOICE_TRANSCRIPT_MAX_LENGTH
    ? null
    : "语音转写文字过长，请缩短到 10000 字以内。";
}
