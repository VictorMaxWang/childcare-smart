import "server-only";

import { createHash } from "node:crypto";

import {
  BlobPreconditionFailedError,
  type GetBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import { readStreamWithByteLimit } from "@/lib/server/upload-security";
import {
  getPrivateAttachment,
  putPrivateObject,
} from "@/lib/server/private-blob";

const MAX_STORYBOOK_BLOB_BYTES = 4 * 1024 * 1024;
const MAX_STORYBOOK_MANIFEST_BYTES = 8 * 1024;
const STORYBOOK_BLOB_SCHEMA_VERSION = 1;
const MEDIA_KEY_PATTERN = /^[a-f0-9]{40}$/u;

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

type StorybookBlobManifest = {
  version: typeof STORYBOOK_BLOB_SCHEMA_VERSION;
  mediaKey: string;
  childId: string;
  storybookId: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  objectPath: string;
  objectEtag: string;
};

type StorybookBlobDependencies = {
  putObject: (
    pathname: string,
    body: Parameters<typeof putPrivateObject>[1],
    options: Parameters<typeof putPrivateObject>[2]
  ) => Promise<PutBlobResult>;
  getObject: (
    pathname: string,
    options?: Parameters<typeof getPrivateAttachment>[1]
  ) => Promise<GetBlobResult | null>;
};

const defaultDependencies: StorybookBlobDependencies = {
  putObject: putPrivateObject,
  getObject: getPrivateAttachment,
};

export interface ParentStoryBookBlobAsset {
  childId: string;
  storybookId: string;
  contentType: string;
  bytes: Buffer;
}

export class ParentStoryBookBlobScopeMismatchError extends Error {
  constructor() {
    super("storybook blob media is outside the authorized child scope");
    this.name = "ParentStoryBookBlobScopeMismatchError";
  }
}

export function isParentStoryBookBlobScopeMismatchError(error: unknown) {
  return (
    error instanceof ParentStoryBookBlobScopeMismatchError ||
    (error instanceof Error &&
      error.name === "ParentStoryBookBlobScopeMismatchError")
  );
}

function assertScopedIdentifier(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 191) {
    throw new Error(`${field} is required and must not exceed 191 characters`);
  }
  return normalized;
}

function assertMediaKey(value: string) {
  const normalized = value.trim();
  if (!MEDIA_KEY_PATTERN.test(normalized)) {
    throw new Error("storybook blob media key must be a SHA-1 hex digest");
  }
  return normalized;
}

function assertContentType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:audio|image)\/[a-z0-9.+-]+$/u.test(normalized)) {
    throw new Error("storybook blob content type must be audio/* or image/*");
  }
  return normalized;
}

function assertByteLength(value: number) {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_STORYBOOK_BLOB_BYTES
  ) {
    throw new Error("storybook blob byte length is invalid");
  }
  return value;
}

function assertSha256(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error("storybook blob digest must be a SHA-256 hex digest");
  }
  return normalized;
}

function assertEtag(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 191 || /[\u0000-\u001f]/u.test(normalized)) {
    throw new Error("storybook blob ETag is invalid");
  }
  return normalized;
}

function scopeDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 20);
}

function contentDigest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildParentStoryBookBlobManifestPath(input: {
  institutionId: string;
  mediaKey: string;
}) {
  const institutionId = assertScopedIdentifier(
    input.institutionId,
    "institutionId"
  );
  const mediaKey = assertMediaKey(input.mediaKey);
  return [
    "smartchildcare",
    "private-media",
    "v1",
    `institution-${scopeDigest(institutionId)}`,
    "storybook-manifests",
    `${mediaKey}.json`,
  ].join("/");
}

export function buildParentStoryBookBlobPaths(input: {
  institutionId: string;
  childId: string;
  mediaKey: string;
  contentType: string;
  sha256: string;
}) {
  const institutionId = assertScopedIdentifier(
    input.institutionId,
    "institutionId"
  );
  const childId = assertScopedIdentifier(input.childId, "childId");
  const mediaKey = assertMediaKey(input.mediaKey);
  const mimeType = assertContentType(input.contentType);
  const digest = assertSha256(input.sha256);
  const extension = MIME_EXTENSIONS[mimeType] ?? "bin";
  const institutionScope = `institution-${scopeDigest(institutionId)}`;
  const basePath = [
    "smartchildcare",
    "private-media",
    "v1",
    institutionScope,
  ].join("/");

  return {
    manifestPath: buildParentStoryBookBlobManifestPath({
      institutionId,
      mediaKey,
    }),
    objectPath: [
      basePath,
      `child-${scopeDigest(childId)}`,
      "storybook",
      mediaKey,
      `${digest}.${extension}`,
    ].join("/"),
  };
}

function createOperationSignal(input: {
  deadlineAtMs: number;
  signal?: AbortSignal;
}) {
  const controller = new AbortController();
  const abortFromCaller = () =>
    controller.abort(input.signal?.reason ?? "storybook blob operation aborted");
  if (input.signal?.aborted) {
    abortFromCaller();
  } else {
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort("storybook blob operation timed out"),
    Math.max(1, input.deadlineAtMs - Date.now())
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function assertOperationActive(deadlineAtMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("storybook blob operation aborted");
  }
  if (deadlineAtMs <= Date.now()) {
    throw new Error("storybook blob operation deadline exhausted");
  }
}

async function readBlobBytes(
  result: GetBlobResult,
  maxBytes: number,
  label: string
) {
  if (
    result.statusCode !== 200 ||
    !Number.isInteger(result.blob.size) ||
    result.blob.size <= 0 ||
    result.blob.size > maxBytes
  ) {
    throw new Error(`${label} has an invalid byte length`);
  }
  try {
    return Buffer.from(await readStreamWithByteLimit(result.stream, maxBytes));
  } catch (error) {
    // 保留 SDK 流错误，供上层区分瞬时网络中断与真实完整性损坏。
    throw new Error(`${label} could not be read`, { cause: error });
  }
}

async function verifyMediaObject(
  result: GetBlobResult,
  expected: {
    contentType: string;
    byteLength: number;
    sha256: string;
    etag?: string;
  }
) {
  const objectContentType =
    result.statusCode === 200
      ? result.blob.contentType.split(";")[0].trim().toLowerCase()
      : "";
  if (
    objectContentType !== expected.contentType ||
    result.statusCode !== 200 ||
    result.blob.size !== expected.byteLength ||
    (expected.etag !== undefined && result.blob.etag !== expected.etag)
  ) {
    throw new Error("storybook blob media metadata does not match");
  }
  const bytes = await readBlobBytes(
    result,
    MAX_STORYBOOK_BLOB_BYTES,
    "storybook blob media"
  );
  if (contentDigest(bytes) !== expected.sha256) {
    throw new Error("storybook blob media digest does not match");
  }
  return bytes;
}

function isBlobPreconditionFailure(error: unknown) {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof Error &&
      error.constructor.name === "BlobPreconditionFailedError")
  );
}

function parseManifest(value: unknown): StorybookBlobManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("storybook blob manifest is invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== STORYBOOK_BLOB_SCHEMA_VERSION) {
    throw new Error("storybook blob manifest version is unsupported");
  }
  return {
    version: STORYBOOK_BLOB_SCHEMA_VERSION,
    mediaKey: assertMediaKey(String(record.mediaKey ?? "")),
    childId: assertScopedIdentifier(String(record.childId ?? ""), "childId"),
    storybookId: assertScopedIdentifier(
      String(record.storybookId ?? ""),
      "storybookId"
    ),
    contentType: assertContentType(String(record.contentType ?? "")),
    byteLength: assertByteLength(Number(record.byteLength)),
    sha256: assertSha256(String(record.sha256 ?? "")),
    objectPath: String(record.objectPath ?? "").trim(),
    objectEtag: assertEtag(String(record.objectEtag ?? "")),
  };
}

/**
 * 先写内容寻址的媒体对象，最后写稳定 manifest 作为提交标记。
 * 即使请求在上传后断开，下一次轮询也能按 mediaKey 精确恢复，而不会再次调用付费 provider。
 */
export async function persistParentStoryBookBlob(
  input: {
    institutionId: string;
    childId: string;
    storybookId: string;
    mediaKey: string;
    contentType: string;
    bytes: Buffer;
    deadlineAtMs: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<StorybookBlobDependencies> = {}
): Promise<ParentStoryBookBlobAsset> {
  const institutionId = assertScopedIdentifier(
    input.institutionId,
    "institutionId"
  );
  const childId = assertScopedIdentifier(input.childId, "childId");
  const storybookId = assertScopedIdentifier(input.storybookId, "storybookId");
  const mediaKey = assertMediaKey(input.mediaKey);
  const contentType = assertContentType(input.contentType);
  const bytes = input.bytes;
  assertByteLength(bytes.byteLength);
  const sha256 = contentDigest(bytes);
  const paths = buildParentStoryBookBlobPaths({
    institutionId,
    childId,
    mediaKey,
    contentType,
    sha256,
  });
  assertOperationActive(input.deadlineAtMs, input.signal);
  const operation = createOperationSignal(input);
  const putObject = dependencies.putObject ?? defaultDependencies.putObject;
  const getObject = dependencies.getObject ?? defaultDependencies.getObject;

  try {
    let objectEtag: string;
    try {
      const object = await putObject(paths.objectPath, bytes, {
        abortSignal: operation.signal,
        addRandomSuffix: false,
        // 内容路径含 SHA-256；不可覆盖可保证 manifest 提交失败时旧提交仍然可读。
        allowOverwrite: false,
        cacheControlMaxAge: 86_400,
        contentType,
        maximumSizeInBytes: MAX_STORYBOOK_BLOB_BYTES,
      });
      objectEtag = object.etag;
    } catch (error) {
      if (!isBlobPreconditionFailure(error)) throw error;
      const existingObject = await getObject(paths.objectPath, {
        abortSignal: operation.signal,
        useCache: false,
      });
      if (!existingObject) {
        throw new Error(
          "storybook blob media object is missing after immutable write conflict"
        );
      }
      await verifyMediaObject(existingObject, {
        contentType,
        byteLength: bytes.byteLength,
        sha256,
      });
      objectEtag = existingObject.blob.etag;
    }
    assertOperationActive(input.deadlineAtMs, input.signal);

    const manifest: StorybookBlobManifest = {
      version: STORYBOOK_BLOB_SCHEMA_VERSION,
      mediaKey,
      childId,
      storybookId,
      contentType,
      byteLength: bytes.byteLength,
      sha256,
      objectPath: paths.objectPath,
      objectEtag,
    };
    await putObject(
      paths.manifestPath,
      Buffer.from(JSON.stringify(manifest), "utf8"),
      {
        abortSignal: operation.signal,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json",
        maximumSizeInBytes: MAX_STORYBOOK_MANIFEST_BYTES,
      }
    );
    return { childId, storybookId, contentType, bytes };
  } finally {
    operation.dispose();
  }
}

/**
 * manifest 路径只由机构和 mediaKey 推导；清单中的对象路径、摘要、大小和作用域均需再次校验。
 */
export async function readParentStoryBookBlob(
  input: {
    institutionId: string;
    mediaKey: string;
    authorizedChildIds?: ReadonlySet<string>;
    deadlineAtMs: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<StorybookBlobDependencies> = {}
): Promise<ParentStoryBookBlobAsset | null> {
  const institutionId = assertScopedIdentifier(
    input.institutionId,
    "institutionId"
  );
  const mediaKey = assertMediaKey(input.mediaKey);
  assertOperationActive(input.deadlineAtMs, input.signal);
  const manifestPath = buildParentStoryBookBlobManifestPath({
    institutionId,
    mediaKey,
  });
  const operation = createOperationSignal(input);
  const getObject = dependencies.getObject ?? defaultDependencies.getObject;

  try {
    const manifestResult = await getObject(manifestPath, {
      abortSignal: operation.signal,
      // manifest 是稳定提交指针，必须绕过 CDN 才能观察到最新提交。
      useCache: false,
    });
    if (!manifestResult) return null;
    const manifestContentType =
      manifestResult.statusCode === 200
        ? manifestResult.blob.contentType.split(";")[0].trim().toLowerCase()
        : "";
    if (manifestContentType !== "application/json") {
      throw new Error("storybook blob manifest has an invalid content type");
    }
    const manifestBytes = await readBlobBytes(
      manifestResult,
      MAX_STORYBOOK_MANIFEST_BYTES,
      "storybook blob manifest"
    );
    let manifest: StorybookBlobManifest;
    try {
      manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("storybook blob")) {
        throw error;
      }
      throw new Error("storybook blob manifest is not valid JSON");
    }
    if (manifest.mediaKey !== mediaKey) {
      throw new Error("storybook blob manifest media key does not match");
    }
    if (
      input.authorizedChildIds &&
      !input.authorizedChildIds.has(manifest.childId)
    ) {
      // 在读取大对象前结束，避免跨幼儿请求产生 Blob 流量和摘要计算。
      throw new ParentStoryBookBlobScopeMismatchError();
    }
    const expectedPaths = buildParentStoryBookBlobPaths({
      institutionId,
      childId: manifest.childId,
      mediaKey,
      contentType: manifest.contentType,
      sha256: manifest.sha256,
    });
    if (manifest.objectPath !== expectedPaths.objectPath) {
      throw new Error("storybook blob manifest object path does not match");
    }
    assertOperationActive(input.deadlineAtMs, input.signal);
    const objectResult = await getObject(manifest.objectPath, {
      abortSignal: operation.signal,
    });
    if (!objectResult) {
      throw new Error("storybook blob media object is missing");
    }
    const bytes = await verifyMediaObject(objectResult, {
      contentType: manifest.contentType,
      byteLength: manifest.byteLength,
      sha256: manifest.sha256,
      etag: manifest.objectEtag,
    });
    return {
      childId: manifest.childId,
      storybookId: manifest.storybookId,
      contentType: manifest.contentType,
      bytes,
    };
  } finally {
    operation.dispose();
  }
}

export const parentStoryBookBlobStoreInternals = {
  maxMediaBytes: MAX_STORYBOOK_BLOB_BYTES,
  maxManifestBytes: MAX_STORYBOOK_MANIFEST_BYTES,
};
