import { createHash } from "node:crypto";
import type { PutBlobResult } from "@vercel/blob";
import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiAttachment, AttachmentRelatedType } from "@/lib/api/types";
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_UPLOAD_BYTES,
} from "@/lib/attachments/constraints";
import {
  apiOk,
  ApiRouteError,
  withApiErrors,
} from "@/lib/server/api-errors";
import { AppDataService } from "@/lib/server/app-data-service";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import {
  deletePrivateAttachment,
  isPrivateBlobConfigured,
  putPrivateAttachment,
} from "@/lib/server/private-blob";
import { requireSession } from "@/lib/server/session";
import {
  assertRequestContentLength,
  readMultipartFormDataWithLimit,
  UploadSecurityError,
  validateUploadFile,
} from "@/lib/server/upload-security";

export const runtime = "nodejs";

const RELATED_TYPES = new Set<AttachmentRelatedType>([
  "message",
  "feedback",
  "health-material",
  "consultation",
  "weekly-report",
  "storybook",
  "meal",
  "growth",
]);
const ATTACHMENT_MAX_REQUEST_BYTES =
  ATTACHMENT_MAX_UPLOAD_BYTES + 256 * 1024;

function attachmentUploadResponseHeaders(replayed: boolean) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    vary: "Cookie",
  });
  if (replayed) headers.set("x-idempotent-replay", "true");
  return headers;
}

type AttachmentUploadService = Pick<
  AppDataService,
  | "authorizeAttachmentUpload"
  | "findUploadedAttachmentByRequestId"
  | "createUploadedAttachment"
>;

export interface AttachmentUploadRouteDependencies {
  resolveSession: typeof requireSession;
  createService: (user: SessionUser) => AttachmentUploadService;
  storageConfigured: typeof isPrivateBlobConfigured;
  upload: typeof putPrivateAttachment;
  remove: typeof deletePrivateAttachment;
}

const defaultDependencies: AttachmentUploadRouteDependencies = {
  resolveSession: requireSession,
  createService: (user) =>
    new AppDataService(user, new DefaultAppDataRepository()),
  storageConfigured: isPrivateBlobConfigured,
  upload: putPrivateAttachment,
  remove: deletePrivateAttachment,
};

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readRelatedType(value: string): AttachmentRelatedType | undefined {
  return RELATED_TYPES.has(value as AttachmentRelatedType)
    ? (value as AttachmentRelatedType)
    : undefined;
}

function safeFileName(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 180);
  return normalized || "attachment";
}

function buildFallbackUploadRequestId(input: {
  childId?: string;
  relatedType: AttachmentRelatedType;
  relatedId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentSha256: string;
}) {
  const fingerprint = [
    input.childId ?? "",
    input.relatedType,
    input.relatedId,
    input.fileName,
    input.mimeType,
    String(input.byteSize),
    input.contentSha256,
  ].join("\u0000");
  return `attachment-${createHash("sha256").update(fingerprint, "utf8").digest("hex")}`;
}

function rethrowUploadSecurityError(error: unknown): never {
  if (error instanceof UploadSecurityError) {
    throw new ApiRouteError(
      "invalid_request",
      error.message,
      error.status
    );
  }
  throw error;
}

export async function handleAttachmentUploadRequest(
  request: Request,
  dependencies: AttachmentUploadRouteDependencies = defaultDependencies
) {
  return withApiErrors(async () => {
    try {
      assertRequestContentLength(request, ATTACHMENT_MAX_REQUEST_BYTES);
    } catch (error) {
      rethrowUploadSecurityError(error);
    }

    const session = await dependencies.resolveSession(request);
    if (session.user.accountKind === "demo") {
      throw new ApiRouteError(
        "provider_unavailable",
        "演示账号不上传私有原始文件；请使用普通账号验证持久媒体。",
        503
      );
    }
    if (!dependencies.storageConfigured()) {
      throw new ApiRouteError(
        "provider_unavailable",
        "私有媒体存储尚未配置，照片未上传。",
        503
      );
    }

    let formData: FormData;
    try {
      formData = await readMultipartFormDataWithLimit(
        request,
        ATTACHMENT_MAX_REQUEST_BYTES
      );
    } catch (error) {
      rethrowUploadSecurityError(error);
    }

    const candidate = formData.get("file");
    if (!(candidate instanceof File)) {
      throw new ApiRouteError("invalid_request", "请选择要上传的文件。");
    }
    const mimeType = candidate.type.trim().toLowerCase();
    if (!ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ApiRouteError(
        "invalid_request",
        "仅支持 JPEG、PNG、WebP、PDF 和常见音频格式。"
      );
    }
    try {
      await validateUploadFile({
        file: candidate,
        maxBytes: ATTACHMENT_MAX_UPLOAD_BYTES,
        allowedMimeTypes: ATTACHMENT_ALLOWED_MIME_TYPES,
      });
    } catch (error) {
      rethrowUploadSecurityError(error);
    }
    const contentSha256 = createHash("sha256")
      .update(Buffer.from(await candidate.arrayBuffer()))
      .digest("hex");

    const childId = readFormString(formData, "childId") || undefined;
    const uploadRequestId =
      readFormString(formData, "uploadRequestId") || undefined;
    const relatedType = readRelatedType(
      readFormString(formData, "relatedType")
    );
    const relatedId = readFormString(formData, "relatedId") || undefined;
    if (!relatedType) {
      throw new ApiRouteError(
        "invalid_request",
        "上传文件必须提供有效的 relatedType。"
      );
    }
    if (!relatedId) {
      throw new ApiRouteError(
        "invalid_request",
        "上传文件必须绑定已创建的业务记录。"
      );
    }

    const service = dependencies.createService(session.user);
    const scope = await service.authorizeAttachmentUpload({
      childId,
      relatedType,
      relatedId,
    });
    const fileName = safeFileName(candidate.name);
    const resolvedUploadRequestId =
      uploadRequestId ??
      buildFallbackUploadRequestId({
        contentSha256,
        childId: scope.childId,
        relatedType,
        relatedId,
        fileName,
        mimeType,
        byteSize: candidate.size,
      });
    const uploadIdentity = {
      uploadRequestId: resolvedUploadRequestId,
      contentSha256,
      childId: scope.childId,
      relatedType,
      relatedId,
      fileName,
      mimeType,
      byteSize: candidate.size,
    };
    const replay =
      await service.findUploadedAttachmentByRequestId(uploadIdentity);
    if (replay) {
      return apiOk(replay, {
        status: 201,
        headers: attachmentUploadResponseHeaders(true),
      });
    }

    let blob: PutBlobResult;
    try {
      blob = await dependencies.upload({
        institutionId: session.user.institutionId,
        childId: scope.childId,
        relatedType,
        file: candidate,
      });
    } catch {
      throw new ApiRouteError(
        "provider_unavailable",
        "私有媒体上传失败，请稍后重试。",
        503
      );
    }

    try {
      const attachment: ApiAttachment =
        await service.createUploadedAttachment(
          {
            childId: scope.childId,
            relatedType,
            relatedId,
            uploadRequestId: resolvedUploadRequestId,
            contentSha256,
            kind: mimeType.startsWith("image/")
              ? "image"
              : mimeType.startsWith("audio/")
                ? "audio"
                : mimeType === "application/pdf"
                  ? "pdf"
                  : "other",
            fileName,
            mimeType,
            byteSize: candidate.size,
          },
          {
            storageProvider: "vercel_blob",
            storageKey: blob.pathname,
            storageEtag: blob.etag,
          }
        );
      const replayed =
        attachment.storageKey !== blob.pathname;
      if (replayed) {
        // 两个相同请求并发落库时，事务只保留首个附件；这里回收输掉竞争的 Blob。
        await dependencies
          .remove(blob.pathname, blob.etag)
          .catch(() => undefined);
      }
      return apiOk(attachment, {
        status: 201,
        headers: attachmentUploadResponseHeaders(replayed),
      });
    } catch (error) {
      try {
        const committed =
          await service.findUploadedAttachmentByRequestId(uploadIdentity);
        if (committed) {
          if (committed.storageKey !== blob.pathname) {
            await dependencies
              .remove(blob.pathname, blob.etag)
              .catch(() => undefined);
          }
          return apiOk(committed, {
            status: 201,
            headers: attachmentUploadResponseHeaders(true),
          });
        }
      } catch {
        // 数据库提交结果仍不可确认时保留 Blob，避免删除已被快照引用的真实文件。
        throw error;
      }
      await dependencies
        .remove(blob.pathname, blob.etag)
        .catch(() => undefined);
      throw error;
    }
  });
}

export function POST(request: Request) {
  return handleAttachmentUploadRequest(request);
}
