import "server-only";

import { getDatabasePool } from "@/lib/db/server";

const MAX_STORYBOOK_MEDIA_BYTES = 4 * 1024 * 1024;

export const ENSURE_STORYBOOK_MEDIA_ASSETS_TABLE_SQL = `
  create table if not exists storybook_media_assets (
    institution_id varchar(191) not null,
    media_key varchar(64) character set ascii collate ascii_bin not null,
    child_id varchar(191) not null,
    storybook_id varchar(191) not null,
    content_type varchar(128) not null,
    media_bytes mediumblob not null,
    byte_length int unsigned not null,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp on update current_timestamp,
    primary key (institution_id, media_key),
    key idx_storybook_media_child (institution_id, child_id),
    key idx_storybook_media_storybook (institution_id, storybook_id)
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
`;

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
}

let ensuredTablePromise: Promise<void> | null = null;

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

export async function ensureStorybookMediaAssetsTable() {
  if (!ensuredTablePromise) {
    // 生产库通过首次真实媒体写入自举；SQL 文件仍保留给显式发布和审计流程。
    ensuredTablePromise = getDatabasePool()
      .execute(ENSURE_STORYBOOK_MEDIA_ASSETS_TABLE_SQL)
      .then(() => undefined)
      .catch((error) => {
        ensuredTablePromise = null;
        throw error;
      });
  }
  await ensuredTablePromise;
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

  await ensureStorybookMediaAssetsTable();
  await getDatabasePool().execute(
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
    ]
  );
}

export async function getStorybookMediaAsset(input: {
  institutionId: string;
  mediaKey: string;
}): Promise<PersistedStorybookMediaAsset | null> {
  const institutionId = assertSafeIdentifier(
    input.institutionId,
    "institutionId"
  );
  const mediaKey = assertMediaKey(input.mediaKey);

  await ensureStorybookMediaAssetsTable();
  const [rows] = await getDatabasePool().execute(
    `
      select child_id, storybook_id, content_type, media_bytes
      from storybook_media_assets
      where institution_id = ? and media_key = ?
      limit 1
    `,
    [institutionId, mediaKey]
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

