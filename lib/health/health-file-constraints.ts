export const HEALTH_FILE_MAX_COUNT = 3;
export const HEALTH_FILE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const HEALTH_FILE_MAX_TEXT_LENGTH = 20_000;
export const HEALTH_FILE_MAX_OCR_BASE64_LENGTH = 2_000_000;

export const HEALTH_FILE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export function isSupportedHealthFileMimeType(value: string) {
  return HEALTH_FILE_ALLOWED_MIME_TYPES.has(value.trim().toLowerCase());
}

export function isBoundedHealthFileText(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= HEALTH_FILE_MAX_TEXT_LENGTH)
  );
}

export function isBoundedOcrBase64(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return encoded.length <= HEALTH_FILE_MAX_OCR_BASE64_LENGTH;
}
