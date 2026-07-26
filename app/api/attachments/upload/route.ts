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

type AttachmentUploadService = Pick<
  AppDataService,
  "authorizeAttachmentUpload" | "createUploadedAttachment"
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

export async function handleAttachmentUploadRequest(
  request: Request,
  dependencies: AttachmentUploadRouteDependencies = defaultDependencies
) {
  return withApiErrors(async () => {
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
      formData = await request.formData();
    } catch {
      throw new ApiRouteError(
        "invalid_request",
        "上传请求必须使用 multipart/form-data。"
      );
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
    if (
      candidate.size <= 0 ||
      candidate.size > ATTACHMENT_MAX_UPLOAD_BYTES
    ) {
      throw new ApiRouteError(
        "invalid_request",
        "文件必须大于 0 字节且不超过 4 MB。"
      );
    }

    const childId = readFormString(formData, "childId") || undefined;
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

    let blob: PutBlobResult;
    try {
      blob = await dependencies.upload({
        institutionId: session.user.institutionId,
        childId: scope.childId,
        relatedType: scope.relatedType,
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
            relatedType: scope.relatedType,
            relatedId: scope.relatedId,
            kind: mimeType.startsWith("image/")
              ? "image"
              : mimeType.startsWith("audio/")
                ? "audio"
                : mimeType === "application/pdf"
                  ? "pdf"
                  : "other",
            fileName: safeFileName(candidate.name),
            mimeType,
            byteSize: candidate.size,
          },
          {
            storageProvider: "vercel_blob",
            storageKey: blob.pathname,
            storageEtag: blob.etag,
          }
        );
      return apiOk(attachment, { status: 201 });
    } catch (error) {
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
