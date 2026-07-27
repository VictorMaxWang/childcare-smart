import "server-only";

import { createHash } from "node:crypto";

import {
  getStorybookMediaAsset,
  upsertStorybookMediaAsset,
  type PersistedStorybookMediaAsset,
  type UpsertStorybookMediaAssetInput,
} from "@/lib/db/storybook-media";
import {
  cacheParentStoryBookMediaBytes,
  markCachedParentStoryBookMediaPersisted,
  readCachedParentStoryBookMedia,
} from "@/lib/server/parent-storybook-cache";

export type ParentStoryBookMediaStorageMode =
  | "cached_media"
  | "database_media";

export interface ParentStoryBookMediaAsset {
  contentType: string;
  bytes: Buffer;
  expiresAt: string | null;
  ownerChildId: string | null;
  ownerStorybookId: string | null;
  storageMode: ParentStoryBookMediaStorageMode;
}

type ParentStoryBookMediaStoreDependencies = {
  upsertPersistent: (
    input: UpsertStorybookMediaAssetInput
  ) => Promise<void>;
  readPersistent: (input: {
    institutionId: string;
    mediaKey: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }) => Promise<PersistedStorybookMediaAsset | null>;
};

const defaultDependencies: ParentStoryBookMediaStoreDependencies = {
  upsertPersistent: upsertStorybookMediaAsset,
  readPersistent: getStorybookMediaAsset,
};

const MEDIA_PERSISTENCE_MAX_ATTEMPTS = 3;
const MEDIA_PERSISTENCE_ATTEMPT_TIMEOUT_MS = 5_000;
const MEDIA_PERSISTENCE_DEFAULT_DEADLINE_MS = 16_000;
const MEDIA_PERSISTENCE_READBACK_RESERVE_MS = 2_000;
const MEDIA_PERSISTENCE_RETRY_DELAY_MS = 150;
const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ER_CON_COUNT_ERROR",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
]);

function normalizePersistenceError(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isTransientPersistenceError(error: unknown) {
  const message = normalizePersistenceError(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code ?? "").trim().toUpperCase()
      : "";
  if (TRANSIENT_DATABASE_ERROR_CODES.has(code)) return true;
  if (
    /(?:operation aborted|deadline exhausted|validation|invalid|required|must not|exceeds)/iu.test(
      message
    )
  ) {
    return false;
  }
  return /(?:database (?:connection|query) timed out|\bETIMEDOUT\b|\bECONNRESET\b|\bEPIPE\b|PROTOCOL_CONNECTION_LOST|too many connections|connection (?:was )?(?:closed|lost))/iu.test(
    message
  );
}

function persistedAssetMatches(
  asset: PersistedStorybookMediaAsset | null,
  input: {
    childId: string;
    storybookId: string;
    contentType: string;
    bytes: Buffer;
  }
) {
  return Boolean(
    asset &&
      asset.childId === input.childId &&
      asset.storybookId === input.storybookId &&
      asset.contentType === input.contentType &&
      asset.bytes.byteLength === input.bytes.byteLength &&
      asset.bytes.equals(input.bytes)
  );
}

export function buildParentStoryBookPersistentMediaKey(input: {
  institutionId: string;
  seed: string;
}) {
  const institutionId = input.institutionId.trim();
  const seed = input.seed.trim();
  if (!institutionId || !seed) {
    throw new Error(
      "institutionId and seed are required for persistent storybook media"
    );
  }
  return createHash("sha1")
    .update(`storybook-media-v2:${institutionId}:${seed}`, "utf8")
    .digest("hex");
}

async function waitForPersistenceRetry(
  delayMs: number,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    throw new Error("storybook media database operation aborted");
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("storybook media database operation aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function persistParentStoryBookMedia(
  input: {
    institutionId: string;
    childId: string;
    storybookId: string;
    contentType: string;
    bytes: Buffer;
    seed: string;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
) {
  const mediaUrl = cacheParentStoryBookMediaBytes(
    input.contentType,
    input.bytes,
    input.seed,
    {
      institutionId: input.institutionId,
      childId: input.childId,
      storybookId: input.storybookId,
    },
    {
      // 稳定 key 让下一次请求可在不重调付费 provider 的前提下恢复已落库、未入账的媒体。
      mediaKey: buildParentStoryBookPersistentMediaKey({
        institutionId: input.institutionId,
        seed: input.seed,
      }),
    }
  );
  const mediaKey = mediaUrl.split("/").at(-1);
  if (!mediaKey) {
    throw new Error("storybook media cache did not return a media key");
  }
  const deadlineAtMs =
    input.deadlineAtMs ?? Date.now() + MEDIA_PERSISTENCE_DEFAULT_DEADLINE_MS;
  if (deadlineAtMs <= Date.now()) {
    throw new Error("storybook media persistence deadline exhausted");
  }

  const upsert =
    dependencies.upsertPersistent ?? defaultDependencies.upsertPersistent;
  const readPersistent =
    dependencies.readPersistent ?? defaultDependencies.readPersistent;
  const upsertDeadlineAtMs =
    deadlineAtMs - MEDIA_PERSISTENCE_READBACK_RESERVE_MS;
  let persisted = false;
  let lastTransientError: unknown = null;
  let terminalError: unknown = null;
  for (
    let attempt = 1;
    attempt <= MEDIA_PERSISTENCE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    if (input.signal?.aborted) {
      throw new Error("storybook media database operation aborted");
    }
    const remainingMs = Math.floor(upsertDeadlineAtMs - Date.now());
    if (remainingMs <= 0) {
      break;
    }
    try {
      // TTS 已经产生真实字节后，只重放同一 mediaKey 的幂等 upsert，
      // 不会再次调用付费 provider；单次查询也不能吃完整个提交预算。
      await upsert({
        institutionId: input.institutionId,
        mediaKey,
        childId: input.childId,
        storybookId: input.storybookId,
        contentType: input.contentType,
        bytes: input.bytes,
        signal: input.signal,
        timeoutMs: Math.max(
          1,
          Math.min(MEDIA_PERSISTENCE_ATTEMPT_TIMEOUT_MS, remainingMs)
        ),
      });
      persisted = true;
      break;
    } catch (error) {
      if (!isTransientPersistenceError(error)) {
        if (!lastTransientError) throw error;
        terminalError = error;
        break;
      }
      lastTransientError = error;
      const canRetry =
        attempt < MEDIA_PERSISTENCE_MAX_ATTEMPTS &&
        !input.signal?.aborted &&
        upsertDeadlineAtMs - Date.now() > MEDIA_PERSISTENCE_RETRY_DELAY_MS;
      if (!canRetry) break;
      await waitForPersistenceRetry(
        MEDIA_PERSISTENCE_RETRY_DELAY_MS,
        input.signal
      );
    }
  }

  if (!persisted) {
    if (!lastTransientError) {
      throw new Error("storybook media persistence deadline exhausted");
    }
    if (input.signal?.aborted) {
      throw new Error("storybook media database operation aborted");
    }
    const remainingMs = Math.floor(deadlineAtMs - Date.now());
    if (remainingMs <= 0) throw lastTransientError;
    try {
      // upsert 超时属于未知提交；只读回查完整作用域与字节，确认后即可安全收尾。
      const existing = await readPersistent({
        institutionId: input.institutionId,
        mediaKey,
        signal: input.signal,
        timeoutMs: Math.max(
          1,
          Math.min(MEDIA_PERSISTENCE_READBACK_RESERVE_MS, remainingMs)
        ),
      });
      if (
        !persistedAssetMatches(existing, {
          childId: input.childId,
          storybookId: input.storybookId,
          contentType: input.contentType,
          bytes: input.bytes,
        })
      ) {
        throw terminalError ?? lastTransientError;
      }
    } catch {
      throw terminalError ?? lastTransientError;
    }
  }

  // 数据库写入成功后才把媒体标成持久可用，防止将仅当前实例可读的 URL 返回给正常账号。
  markCachedParentStoryBookMediaPersisted(mediaKey);

  return { mediaUrl, mediaKey };
}

export async function readParentStoryBookMedia(
  input: {
    institutionId: string;
    mediaKey: string;
    allowPersistent?: boolean;
    bypassCache?: boolean;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
): Promise<ParentStoryBookMediaAsset | null> {
  const cached = input.bypassCache
    ? null
    : readCachedParentStoryBookMedia(input.mediaKey, {
        institutionId: input.institutionId,
      });
  if (cached) return cached;
  if (input.allowPersistent === false) return null;
  if (!/^[a-f0-9]{40}$/u.test(input.mediaKey)) return null;
  if (input.signal?.aborted) {
    throw new Error("storybook media database operation aborted");
  }
  const remainingMs = Math.floor(
    (input.deadlineAtMs ??
      Date.now() + MEDIA_PERSISTENCE_ATTEMPT_TIMEOUT_MS) - Date.now()
  );
  if (remainingMs <= 0) {
    throw new Error("storybook media read deadline exhausted");
  }

  const persisted = await (
    dependencies.readPersistent ?? defaultDependencies.readPersistent
  )({
    institutionId: input.institutionId,
    mediaKey: input.mediaKey,
    timeoutMs: Math.max(
      1,
      Math.min(MEDIA_PERSISTENCE_ATTEMPT_TIMEOUT_MS, remainingMs)
    ),
    signal: input.signal,
  });
  if (!persisted) return null;

  return {
    contentType: persisted.contentType,
    bytes: persisted.bytes,
    expiresAt: null,
    ownerChildId: persisted.childId,
    ownerStorybookId: persisted.storybookId,
    storageMode: "database_media",
  };
}
