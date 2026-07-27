import "server-only";

const CONTENT_LENGTH_PATTERN = /^\d+$/u;
const BASE64_PATTERN =
  /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu;
const SIGNATURE_READ_BYTES = 1024;
export const MULTIPART_FORM_DATA_OVERHEAD_BYTES = 256 * 1024;
export const AUDIO_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const MIME_TYPE_ALIASES = new Map([
  ["audio/m4a", "audio/mp4"],
  ["audio/mp3", "audio/mpeg"],
  ["audio/vnd.wave", "audio/wav"],
  ["audio/wave", "audio/wav"],
  ["audio/x-m4a", "audio/mp4"],
  ["audio/x-mpeg", "audio/mpeg"],
  ["audio/x-wav", "audio/wav"],
]);

export class UploadSecurityError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(
    status: 400 | 413 | 415,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "UploadSecurityError";
    this.status = status;
  }
}

function normalizeMimeType(value?: string) {
  const essence = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return MIME_TYPE_ALIASES.get(essence) ?? essence;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]) {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.byteLength < offset + value.length) return false;
  return Array.from(value).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0)
  );
}

function containsPdfHeader(bytes: Uint8Array) {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
  const maxOffset = Math.min(1024, bytes.byteLength) - signature.length;
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    if (
      signature.every(
        (value, index) => bytes[offset + index] === value
      )
    ) {
      return true;
    }
  }
  return false;
}

export function detectMediaMimeType(bytes: Uint8Array) {
  if (
    startsWithBytes(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return "image/png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP")) {
    return "image/webp";
  }
  if (containsPdfHeader(bytes)) {
    return "application/pdf";
  }
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WAVE")) {
    return "audio/wav";
  }
  if (hasAscii(bytes, 0, "OggS")) {
    return "audio/ogg";
  }
  if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "audio/webm";
  }
  if (hasAscii(bytes, 4, "ftyp")) {
    return "audio/mp4";
  }
  if (
    hasAscii(bytes, 0, "ID3") ||
    (bytes.byteLength >= 2 &&
      bytes[0] === 0xff &&
      (bytes[1] & 0xe0) === 0xe0)
  ) {
    return "audio/mpeg";
  }
  return undefined;
}

export function validateMediaBytes(input: {
  bytes: Uint8Array;
  claimedMimeType?: string;
  allowedMimeTypes: ReadonlySet<string>;
}) {
  if (input.bytes.byteLength === 0) {
    throw new UploadSecurityError(400, "上传文件不能为空。");
  }

  const claimedMimeType = normalizeMimeType(input.claimedMimeType);
  if (
    claimedMimeType &&
    !input.allowedMimeTypes.has(claimedMimeType)
  ) {
    throw new UploadSecurityError(415, "上传文件类型不受支持。");
  }

  const detectedMimeType = detectMediaMimeType(input.bytes);
  if (
    !detectedMimeType ||
    !input.allowedMimeTypes.has(detectedMimeType)
  ) {
    throw new UploadSecurityError(
      415,
      "无法从文件内容确认受支持的媒体类型。"
    );
  }
  if (claimedMimeType && claimedMimeType !== detectedMimeType) {
    throw new UploadSecurityError(
      415,
      "文件内容与声明类型不一致，上传已拒绝。"
    );
  }

  return {
    bytes: input.bytes,
    mimeType: detectedMimeType,
  };
}

export function inspectBase64Media(input: {
  base64: string;
  claimedMimeType?: string;
  allowedMimeTypes: ReadonlySet<string>;
  maxBytes: number;
}) {
  const normalized = input.base64.replace(/\s+/gu, "");
  if (!normalized) {
    throw new UploadSecurityError(400, "上传文件不能为空。");
  }

  // 先按编码长度拦截，避免为明显超限的 base64 分配解码缓冲区。
  const maxEncodedLength = Math.ceil(input.maxBytes / 3) * 4 + 4;
  if (normalized.length > maxEncodedLength) {
    throw new UploadSecurityError(413, "上传文件超过服务端大小限制。");
  }

  const remainder = normalized.length % 4;
  if (remainder === 1 || !/^[a-z0-9+/]*={0,2}$/iu.test(normalized)) {
    throw new UploadSecurityError(400, "上传文件的 base64 编码无效。");
  }
  const padded =
    remainder === 0
      ? normalized
      : normalized.padEnd(normalized.length + (4 - remainder), "=");
  if (!BASE64_PATTERN.test(padded)) {
    throw new UploadSecurityError(400, "上传文件的 base64 编码无效。");
  }

  const decoded = Buffer.from(padded, "base64");
  const canonical = decoded.toString("base64").replace(/=+$/u, "");
  if (canonical !== normalized.replace(/=+$/u, "")) {
    throw new UploadSecurityError(400, "上传文件的 base64 编码无效。");
  }
  if (decoded.byteLength > input.maxBytes) {
    throw new UploadSecurityError(413, "上传文件超过服务端大小限制。");
  }

  return validateMediaBytes({
    bytes: decoded,
    claimedMimeType: input.claimedMimeType,
    allowedMimeTypes: input.allowedMimeTypes,
  });
}

export function assertRequestContentLength(
  request: Request,
  maxBytes: number
) {
  const raw = request.headers.get("content-length");
  if (raw === null) return;
  const value = raw.trim();
  if (!CONTENT_LENGTH_PATTERN.test(value)) {
    throw new UploadSecurityError(400, "Content-Length 请求头无效。");
  }
  const declaredBytes = Number(value);
  if (!Number.isSafeInteger(declaredBytes)) {
    throw new UploadSecurityError(400, "Content-Length 请求头无效。");
  }
  if (declaredBytes > maxBytes) {
    throw new UploadSecurityError(413, "上传请求正文超过服务端大小限制。");
  }
}

export async function readStreamWithByteLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
) {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value?.byteLength) continue;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("upload body limit exceeded").catch(() => undefined);
        throw new UploadSecurityError(
          413,
          "上传请求正文超过服务端大小限制。"
        );
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof UploadSecurityError) throw error;
    // 对外只保留安全消息，内部 cause 用于区分可重试网络中断与非法请求。
    throw new UploadSecurityError(400, "上传请求正文读取失败。", {
      cause: error,
    });
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readRequestWithBodyLimit(
  request: Request,
  maxBytes: number
) {
  assertRequestContentLength(request, maxBytes);

  const body = request.body
    ? await readStreamWithByteLimit(request.body, maxBytes)
    : new Uint8Array();

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const canHaveBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(request.url, {
    method: request.method,
    headers,
    body: canHaveBody && body.byteLength > 0 ? body : undefined,
    signal: request.signal,
  });
}

export async function readMultipartFormDataWithLimit(
  request: Request,
  maxBytes: number
) {
  const boundedRequest = await readRequestWithBodyLimit(request, maxBytes);
  try {
    return await boundedRequest.formData();
  } catch {
    throw new UploadSecurityError(
      400,
      "上传请求必须使用有效的 multipart/form-data。"
    );
  }
}

export async function validateUploadFile(input: {
  file: File;
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
}) {
  if (input.file.size <= 0) {
    throw new UploadSecurityError(400, "上传文件不能为空。");
  }
  if (input.file.size > input.maxBytes) {
    throw new UploadSecurityError(413, "上传文件超过服务端大小限制。");
  }

  const header = new Uint8Array(
    await input.file.slice(0, SIGNATURE_READ_BYTES).arrayBuffer()
  );
  return validateMediaBytes({
    bytes: header,
    claimedMimeType: input.file.type,
    allowedMimeTypes: input.allowedMimeTypes,
  });
}

export function validateAudioUploadFile(file: File, maxBytes: number) {
  return validateUploadFile({
    file,
    maxBytes,
    allowedMimeTypes: AUDIO_UPLOAD_ALLOWED_MIME_TYPES,
  });
}
