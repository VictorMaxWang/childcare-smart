import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  del,
  get,
  put,
  type GetBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_UPLOAD_BYTES,
} from "@/lib/attachments/constraints";
import type { AttachmentRelatedType } from "@/lib/api/types";
import { validateUploadFile } from "@/lib/server/upload-security";

type BlobEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;
export type PrivateAttachmentReadResult = GetBlobResult;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/pdf": "pdf",
};

function scopeDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 20);
}

export function isPrivateBlobConfigured(env: BlobEnv = process.env) {
  return Boolean(
    env.BLOB_READ_WRITE_TOKEN ||
      (env.VERCEL_OIDC_TOKEN && env.BLOB_STORE_ID)
  );
}

export function buildPrivateAttachmentPath(input: {
  institutionId: string;
  childId?: string;
  relatedType?: AttachmentRelatedType;
  mimeType: string;
  objectId?: string;
}) {
  const extension =
    MIME_EXTENSIONS[input.mimeType.trim().toLowerCase()] ?? "bin";
  const institutionScope = scopeDigest(input.institutionId);
  const childScope = input.childId
    ? `child-${scopeDigest(input.childId)}`
    : "institution";
  const relatedScope = input.relatedType ?? "attachment";
  const objectId = input.objectId ?? randomUUID();
  return [
    "smartchildcare",
    "private-media",
    "v1",
    `institution-${institutionScope}`,
    childScope,
    relatedScope,
    `${objectId}.${extension}`,
  ].join("/");
}

export async function putPrivateAttachment(input: {
  institutionId: string;
  childId?: string;
  relatedType?: AttachmentRelatedType;
  file: File;
}): Promise<PutBlobResult> {
  const validated = await validatePrivateAttachmentFile(input.file);
  const pathname = buildPrivateAttachmentPath({
    institutionId: input.institutionId,
    childId: input.childId,
    relatedType: input.relatedType,
    mimeType: validated.mimeType,
  });
  return put(pathname, input.file, {
    access: "private",
    addRandomSuffix: true,
    contentType: validated.mimeType,
    cacheControlMaxAge: 300,
  });
}

export function validatePrivateAttachmentFile(file: File) {
  // Route 会先校验一次；Blob 边界重复校验可阻止未来新增调用方绕过入口约束。
  return validateUploadFile({
    file,
    maxBytes: ATTACHMENT_MAX_UPLOAD_BYTES,
    allowedMimeTypes: ATTACHMENT_ALLOWED_MIME_TYPES,
  });
}

export function getPrivateAttachment(
  storageKey: string,
  options: { ifNoneMatch?: string } = {}
): Promise<GetBlobResult | null> {
  return get(storageKey, {
    access: "private",
    ifNoneMatch: options.ifNoneMatch,
  });
}

export function deletePrivateAttachment(
  storageKey: string,
  storageEtag?: string
) {
  return del(storageKey, storageEtag ? { ifMatch: storageEtag } : undefined);
}
