import "server-only";

import sharp from "sharp";
import type { HealthFileBridgeFile } from "@/lib/ai/types";
import {
  HEALTH_FILE_MAX_OCR_BASE64_LENGTH,
  HEALTH_FILE_MAX_TEXT_LENGTH,
  HEALTH_FILE_MAX_UPLOAD_BYTES,
} from "@/lib/health/health-file-constraints";
import { ApiRouteError } from "@/lib/server/api-errors";
import type { AppDataService } from "@/lib/server/app-data-service";
import {
  getPrivateAttachment,
  type PrivateAttachmentReadResult,
} from "@/lib/server/private-blob";
import {
  readStreamWithByteLimit,
  UploadSecurityError,
  validateMediaBytes,
} from "@/lib/server/upload-security";

const HEALTH_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const HEALTH_BINARY_MIME_TYPES = new Set([
  ...HEALTH_IMAGE_MIME_TYPES,
  "application/pdf",
]);
const MAX_PDF_PAGES = 20;

export interface PreparedHealthAttachmentOcrPayload {
  mimeType: string;
  imageBase64?: string;
  extractedText?: string;
}

export function stripHealthFileBinaryPayload(
  file: HealthFileBridgeFile
): HealthFileBridgeFile {
  // OCR 完成后只把结构化文本交给规则分析与 Brain 服务，避免同一份健康影像
  // 在内部服务之间重复传输或被意外写入日志/快照。
  return {
    ...file,
    imageBase64: undefined,
    dataUrl: undefined,
    meta: undefined,
  };
}

function appendBoundedText(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, HEALTH_FILE_MAX_TEXT_LENGTH);
}

async function prepareImage(bytes: Uint8Array) {
  const source = Buffer.from(bytes);
  const attempts = [
    { width: 1600, quality: 80 },
    { width: 1200, quality: 68 },
    { width: 900, quality: 58 },
  ];

  for (const attempt of attempts) {
    const output = await sharp(source, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: attempt.width,
        height: attempt.width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();
    const imageBase64 = output.toString("base64");
    if (imageBase64.length <= HEALTH_FILE_MAX_OCR_BASE64_LENGTH) {
      return imageBase64;
    }
  }

  throw new ApiRouteError(
    "invalid_request",
    "图片压缩后仍然过大，请裁剪关键区域后重新上传。"
  );
}

async function extractPdfText(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;

  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new ApiRouteError(
        "invalid_request",
        `PDF 最多支持 ${MAX_PDF_PAGES} 页，请拆分后重新上传。`
      );
    }
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .trim();
      if (text) pageTexts.push(text);
      if (pageTexts.join("\n\n").length >= HEALTH_FILE_MAX_TEXT_LENGTH) break;
    }
    return pageTexts.join("\n\n").slice(0, HEALTH_FILE_MAX_TEXT_LENGTH);
  } finally {
    await document.destroy();
  }
}

export async function prepareHealthAttachmentOcrPayload(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<PreparedHealthAttachmentOcrPayload> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > HEALTH_FILE_MAX_UPLOAD_BYTES) {
    throw new ApiRouteError(
      "invalid_request",
      "健康材料原文件必须大于 0 字节且不超过 4 MB。"
    );
  }

  let mimeType: string;
  try {
    mimeType = validateMediaBytes({
      bytes: input.bytes,
      claimedMimeType: input.mimeType,
      allowedMimeTypes: HEALTH_BINARY_MIME_TYPES,
    }).mimeType;
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      throw new ApiRouteError(
        "invalid_request",
        error.message,
        error.status
      );
    }
    throw error;
  }

  if (HEALTH_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      mimeType: "image/jpeg",
      imageBase64: await prepareImage(input.bytes),
    };
  }
  if (mimeType === "application/pdf") {
    const extractedText = await extractPdfText(input.bytes);
    if (!extractedText.trim()) {
      // 私有扫描件不应为方便 OCR 而生成公开 URL；当前明确要求转图片，
      // 既避免隐私材料外泄，也避免空文本被后续规则解析器误判为成功。
      throw new ApiRouteError(
        "provider_unavailable",
        "扫描型 PDF 未包含可提取文字，请将关键页导出为图片后上传。",
        503
      );
    }
    return {
      mimeType,
      extractedText,
    };
  }

  throw new ApiRouteError(
    "invalid_request",
    "健康材料解析仅支持 JPEG、PNG、WebP 图片和 PDF。"
  );
}

async function readPrivateBytes(
  storageKey: string,
  readPrivate: typeof getPrivateAttachment
) {
  let result: PrivateAttachmentReadResult | null;
  try {
    result = await readPrivate(storageKey);
  } catch {
    throw new ApiRouteError(
      "provider_unavailable",
      "健康材料原文件读取失败，请稍后重试。",
      503
    );
  }
  if (!result || result.statusCode !== 200) {
    throw new ApiRouteError("not_found", "健康材料原文件不存在。");
  }
  if (
    typeof result.blob.size !== "number" ||
    result.blob.size <= 0 ||
    result.blob.size > HEALTH_FILE_MAX_UPLOAD_BYTES
  ) {
    throw new ApiRouteError(
      "invalid_request",
      "健康材料原文件大小不在允许范围内。"
    );
  }
  try {
    return await readStreamWithByteLimit(
      result.stream,
      HEALTH_FILE_MAX_UPLOAD_BYTES
    );
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      throw new ApiRouteError(
        "invalid_request",
        error.message,
        error.status
      );
    }
    throw error;
  }
}

export async function hydrateHealthFileAttachments(
  files: HealthFileBridgeFile[],
  input: {
    childId: string;
    service: Pick<AppDataService, "getAttachment">;
    readPrivate?: typeof getPrivateAttachment;
  }
) {
  const readPrivate = input.readPrivate ?? getPrivateAttachment;
  return Promise.all(
    files.map(async (file) => {
      if (!file.attachmentId) return file;
      const attachment = await input.service.getAttachment(file.attachmentId);
      if (
        attachment.childId !== input.childId ||
        attachment.relatedType !== "health-material" ||
        attachment.storageMode !== "object_storage" ||
        attachment.storageProvider !== "vercel_blob" ||
        !attachment.storageKey
      ) {
        throw new ApiRouteError(
          "forbidden_scope",
          "健康材料附件与当前幼儿或解析任务不匹配。"
        );
      }

      const bytes = await readPrivateBytes(attachment.storageKey, readPrivate);
      const prepared = await prepareHealthAttachmentOcrPayload({
        bytes,
        mimeType: attachment.mimeType,
      });
      return {
        ...file,
        name: attachment.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: attachment.byteSize ?? bytes.byteLength,
        previewText: appendBoundedText(
          file.previewText,
          prepared.extractedText
        ),
        imageBase64: prepared.imageBase64,
        dataUrl: undefined,
        meta: undefined,
      } satisfies HealthFileBridgeFile;
    })
  );
}
