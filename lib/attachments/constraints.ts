export const ATTACHMENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 3;

export const ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "application/pdf",
]);

export function isAllowedAttachmentMimeType(value: string) {
  return ATTACHMENT_ALLOWED_MIME_TYPES.has(value.trim().toLowerCase());
}
