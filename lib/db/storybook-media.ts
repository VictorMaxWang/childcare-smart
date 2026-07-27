import "server-only";

import { getDatabasePool } from "@/lib/db/server";

const MAX_STORYBOOK_MEDIA_BYTES = 4 * 1024 * 1024;
const DEFAULT_STORYBOOK_MEDIA_QUERY_TIMEOUT_MS = 10_000;

type StorybookMediaRow = {
  child_id: string;
  storybook_id: string;
  content_type: string;
  media_bytes: Buffer | Uint8Array;
};

export interface PersistedStorybookMediaAsset {
  childId: string;
  storybookId: string;
  contentType: string;
  bytes: Buffer;
}

export interface UpsertStorybookMediaAssetInput
  extends PersistedStorybookMediaAsset {
  institutionId: string;
  mediaKey: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function assertSafeIdentifier(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 191) {
    throw new Error(`${field} is required and must not exceed 191 characters`);
  }
  return normalized;
}

function assertMediaKey(value: string) {
  const normalized = value.trim();
  if (!/^[a-f0-9]{40}$/u.test(normalized)) {
    throw new Error("storybook media key must be a SHA-1 hex digest");
  }
  return normalized;
}

function assertContentType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:audio|image)\/[a-z0-9.+-]+$/u.test(normalized)) {
    throw new Error("storybook media content type must be audio/* or image/*");
  }
  return normalized;
}

function assertMediaBytes(value: Buffer) {
  if (!value.byteLength) {
    throw new Error("storybook media bytes must not be empty");
  }
  // 单个媒体限制可防止异常模型响应挤占数据库，同时覆盖短篇绘本的 WAV 与图片资源。
  if (value.byteLength > MAX_STORYBOOK_MEDIA_BYTES) {
    throw new Error(
      `storybook media exceeds ${MAX_STORYBOOK_MEDIA_BYTES} bytes`
    );
  }
  return value;
}

function resolveTimeoutMs(value?: number) {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.max(1, Math.min(30_000, Math.floor(Number(value))))
    : DEFAULT_STORYBOOK_MEDIA_QUERY_TIMEOUT_MS;
}

async function acquireConnection(input: {
  deadlineAtMs: number;
  signal?: AbortSignal;
}) {
  if (input.signal?.aborted) {
    throw new Error("storybook media database operation aborted");
  }
  const pending = getDatabasePool().getConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortRequest: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    const rejectCancelled = () => {
      reject(
        new Error(
          input.signal?.aborted
            ? "storybook media database operation aborted"
            : "storybook media database connection timed out"
        )
      );
    };
    if (input.signal) {
      abortRequest = rejectCancelled;
      input.signal.addEventListener("abort", abortRequest, { once: true });
      if (input.signal.aborted) rejectCancelled();
    }
    timer = setTimeout(
      rejectCancelled,
      Math.max(1, input.deadlineAtMs - Date.now())
    );
  });
  try {
    return await Promise.race([pending, cancellation]);
  } catch (error) {
    void pending.then(
      (connection) => connection.release(),
      () => undefined
    );
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortRequest) {
      input.signal?.removeEventListener("abort", abortRequest);
    }
  }
}

async function executeMediaQuery(
  sql: string,
  values: Array<string | number | Buffer>,
  input: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
) {
  // mysql2 的 timeout 只会拒绝客户端 Promise；同时销毁连接，避免超时查询被重新放回连接池。
  // 写入使用幂等 upsert，因此即使提交结果处于网络不确定态，也可由同一 mediaKey 安全重放。
  const timeoutMs = resolveTimeoutMs(input.timeoutMs);
  const deadlineAtMs = Date.now() + timeoutMs;
  const connection = await acquireConnection({
    deadlineAtMs,
    signal: input.signal,
  });
  let destroyed = false;
  let cancellationReason: "aborted" | "timed-out" | null = null;
  const destroy = (reason: "aborted" | "timed-out") => {
    if (destroyed) return;
    cancellationReason = reason;
    destroyed = true;
    connection.destroy();
  };
  const abortRequest = () => destroy("aborted");
  input.signal?.addEventListener("abort", abortRequest, { once: true });
  if (input.signal?.aborted) abortRequest();
  const remainingMs = Math.max(1, deadlineAtMs - Date.now());
  const timer = setTimeout(() => destroy("timed-out"), remainingMs);
  try {
    return await connection.execute(
      { sql, timeout: remainingMs },
      values
    );
  } catch (error) {
    if (cancellationReason || input.signal?.aborted) {
      throw new Error(
        cancellationReason === "aborted" || input.signal?.aborted
          ? "storybook media database operation aborted"
          : "storybook media database query timed out"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortRequest);
    if (!destroyed) connection.release();
  }
}

export async function upsertStorybookMediaAsset(
  input: UpsertStorybookMediaAssetInput
) {
  const institutionId = assertSafeIdentifier(
    input.institutionId,
    "institutionId"
  );
  const childId = assertSafeIdentifier(input.childId, "childId");
  const storybookId = assertSafeIdentifier(input.storybookId, "storybookId");
  const mediaKey = assertMediaKey(input.mediaKey);
  const contentType = assertContentType(input.contentType);
  const bytes = assertMediaBytes(input.bytes);

  await executeMediaQuery(
    `
      insert into storybook_media_assets (
        institution_id,
        media_key,
        child_id,
        storybook_id,
        content_type,
        media_bytes,
        byte_length
      )
      values (?, ?, ?, ?, ?, ?, ?)
      on duplicate key update
        child_id = values(child_id),
        storybook_id = values(storybook_id),
        content_type = values(content_type),
        media_bytes = values(media_bytes),
        byte_length = values(byte_length)
    `,
    [
      institutionId,
      mediaKey,
      childId,
      storybookId,
      contentType,
      bytes,
      bytes.byteLength,
    ],
    {
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }
  );
}

export async function getStorybookMediaAsset(input: {
  institutionId: string;
  mediaKey: string;
  authorizedChildIds?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<PersistedStorybookMediaAsset | null> {
  const institutionId = assertSafeIdentifier(
    input.institutionId,
    "institutionId"
  );
  const mediaKey = assertMediaKey(input.mediaKey);
  const authorizedChildIds = input.authorizedChildIds
    ? Array.from(
        new Set(
          input.authorizedChildIds.map((childId) =>
            assertSafeIdentifier(childId, "authorizedChildId")
          )
        )
      )
    : null;
  if (authorizedChildIds?.length === 0) return null;
  if ((authorizedChildIds?.length ?? 0) > 500) {
    throw new Error("authorizedChildIds must not exceed 500 items");
  }
  const childScopeSql = authorizedChildIds
    ? `and child_id in (${authorizedChildIds.map(() => "?").join(", ")})`
    : "";

  const [rows] = await executeMediaQuery(
    `
      select child_id, storybook_id, content_type, media_bytes
      from storybook_media_assets
      where institution_id = ? and media_key = ?
        ${childScopeSql}
      limit 1
    `,
    [institutionId, mediaKey, ...(authorizedChildIds ?? [])],
    {
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }
  );
  const row = Array.isArray(rows)
    ? (rows[0] as StorybookMediaRow | undefined)
    : undefined;
  if (!row) return null;

  return {
    childId: row.child_id,
    storybookId: row.storybook_id,
    contentType: row.content_type,
    bytes: Buffer.isBuffer(row.media_bytes)
      ? row.media_bytes
      : Buffer.from(row.media_bytes),
  };
}
