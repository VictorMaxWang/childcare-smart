import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  del,
  get,
  put,
  type GetBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import type { AttachmentRelatedType } from "@/lib/api/types";

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
  const pathname = buildPrivateAttachmentPath({
    institutionId: input.institutionId,
    childId: input.childId,
    relatedType: input.relatedType,
    mimeType: input.file.type,
  });
  return put(pathname, input.file, {
    access: "private",
    addRandomSuffix: true,
    contentType: input.file.type,
    cacheControlMaxAge: 300,
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
