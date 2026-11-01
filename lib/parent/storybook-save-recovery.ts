import { getStorybook, upsertStorybook, type UpsertStorybookInput } from "@/lib/api/storybooks";
import { ApiClientError } from "@/lib/api/errors";
import type { ApiStorybook } from "@/lib/api/types";
import type { ParentStoryBookResponse } from "@/lib/ai/types";

export interface StorybookSaveScope { userId: string; institutionId: string; childId: string }
export interface PendingStorybookSave {
  version: 1;
  scope: StorybookSaveScope;
  input: UpsertStorybookInput & { storybookId: string; response: Record<string, unknown> };
  createdAt: number;
}
export type StorybookSaveOutcome = { status: "saved" | "failed" | "unknown" | "superseded"; message: string };
type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const SAVE_TIMEOUT_MS = 15_000;

/** 用户、机构和儿童同时参与键；共享设备退出/换号后不能继续提交上一账号的签名正文。 */
export function storybookSaveScopeKey(scope: StorybookSaveScope) {
  return JSON.stringify([scope.institutionId, scope.userId, scope.childId]);
}
function pendingKey(scope: StorybookSaveScope) { return `childcare-storybook-pending-save:v1:${storybookSaveScopeKey(scope)}`; }
function sessionStorageOrNull(): PendingStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
export function createPendingStorybookSave(scope: StorybookSaveScope, story: ParentStoryBookResponse, sourceRecordIds: string[]): PendingStorybookSave {
  if (!scope.userId || !scope.institutionId || scope.childId !== story.childId || !story.storyId) throw new Error("绘本保存作用域无效。");
  // 回执签名覆盖完整响应：不能补字段、裁剪媒体或使用显示层的归一化结果重建待保存正文。
  return { version: 1, scope: { ...scope }, createdAt: Date.now(), input: structuredClone({ childId: scope.childId, storybookId: story.storyId, response: story as unknown as Record<string, unknown>, sourceRecordIds, generatedAt: story.generatedAt }) };
}
export function storePendingStorybookSave(pending: PendingStorybookSave, storage = sessionStorageOrNull()) {
  try { const text = JSON.stringify(pending); if (!storage || text.length > 1_000_000) return false; storage.setItem(pendingKey(pending.scope), text); return true; }
  catch { return false; /* 禁用或容量不足时，调用方必须提示保留当前页面。 */ }
}
export function loadPendingStorybookSave(scope: StorybookSaveScope, storage = sessionStorageOrNull()): PendingStorybookSave | null {
  try {
    const text = storage?.getItem(pendingKey(scope));
    if (!text || text.length > 1_000_000) return null;
    const pending = JSON.parse(text) as PendingStorybookSave;
    if (pending.version !== 1 || !pending.scope || storybookSaveScopeKey(pending.scope) !== storybookSaveScopeKey(scope)
      || !Number.isFinite(pending.createdAt) || pending.createdAt > Date.now() || Date.now() - pending.createdAt > PENDING_TTL_MS
      || pending.input?.childId !== scope.childId || !pending.input.storybookId || pending.input.response?.storyId !== pending.input.storybookId
      || pending.input.response?.childId !== scope.childId || !Array.isArray(pending.input.response.scenes)) return null;
    return pending;
  } catch { return null; }
}
export function clearPendingStorybookSave(pending: PendingStorybookSave, storage = sessionStorageOrNull()) {
  try {
    // 较早的保存完成不能清掉稍后媒体版本的待保存任务。
    const current = loadPendingStorybookSave(pending.scope, storage);
    if (current && sameJson(current.input, pending.input)) storage?.removeItem(pendingKey(pending.scope));
  } catch { /* 清理本地提示失败不影响已确认的服务端结果。 */ }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function sameJson(left: unknown, right: unknown) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function savedResponse(book: ApiStorybook) { return book.pages?.map(page => page.response).find(value => value && typeof value === "object"); }
function matchesSaved(book: ApiStorybook, pending: PendingStorybookSave) {
  return book.storybookId === pending.input.storybookId && book.childId === pending.scope.childId && sameJson(savedResponse(book), pending.input.response);
}
const SCENE_MEDIA_FIELDS = new Set(["imageUrl", "assetRef", "imageStatus", "imageSourceKind", "imageProvider", "imageCacheHit", "imageStorageObject", "audioUrl", "audioRef", "audioStatus", "audioProvider", "audioCacheHit", "audioStorageObject", "engineId", "voiceName"]);
function withoutFields(value: Record<string, unknown>, fields: Set<string>) { return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.has(key))); }
function immutableStory(value: Record<string, unknown>) {
  const meta = value.providerMeta as Record<string, unknown> | undefined;
  const diagnostics = meta?.diagnostics as Record<string, unknown> | undefined;
  return {
    ...withoutFields(value, new Set(["provenanceAttestation", "providerTrace", "cacheMeta", "providerMeta", "scenes"])),
    providerMeta: meta && { ...withoutFields(meta, new Set(["imageProvider", "audioProvider", "imageDelivery", "audioDelivery", "cacheHitCount", "diagnostics"])),
      ...(diagnostics ? { diagnostics: withoutFields(diagnostics, new Set(["image", "audio"])) } : {}) },
    scenes: Array.isArray(value.scenes) ? value.scenes.map(scene => withoutFields(scene, SCENE_MEDIA_FIELDS)) : null,
  };
}
/** 仅允许同一生成结果的媒体单调补齐；正文/参数不同或替换既有 ready 资源都需要人工重新读取。 */
export function canAdvanceSavedStorybook(book: ApiStorybook, pending: PendingStorybookSave) {
  const old = savedResponse(book) as Record<string, unknown> | undefined, next = pending.input.response;
  if (!old || book.storybookId !== pending.input.storybookId || book.childId !== pending.scope.childId || !sameJson(immutableStory(old), immutableStory(next))) return false;
  if (!Array.isArray(old.scenes) || !Array.isArray(next.scenes) || old.scenes.length !== next.scenes.length) return false;
  const nextScenes = next.scenes as Record<string, unknown>[];
  return old.scenes.every((scene: Record<string, unknown>, index: number) => {
    const updated = nextScenes[index];
    return ["image", "audio"].every(channel => {
      if (scene[`${channel}Status`] !== "ready") return true;
      if (updated[`${channel}Status`] !== "ready") return false;
      const identityFields = channel === "image" ? ["imageUrl", "assetRef", "imageSourceKind", "imageProvider"] : ["audioUrl", "audioRef", "audioProvider", "engineId", "voiceName"];
      return identityFields.every(field => !scene[field] || scene[field] === updated[field]);
    });
  });
}
async function deadline<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([request(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("绘本保存请求超时，结果待确认。")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer!); }
}

/** 只重试持久化：未知结果先精确回读同一本书，既不生成新书，也不重新调模型。 */
export async function savePendingStorybook(
  pending: PendingStorybookSave,
  options: { reconcileFirst?: boolean; isCurrent?: () => boolean; timeoutMs?: number } = {},
): Promise<StorybookSaveOutcome> {
  const current = options.isCurrent ?? (() => true), timeoutMs = options.timeoutMs ?? SAVE_TIMEOUT_MS;
  const superseded: StorybookSaveOutcome = { status: "superseded", message: "账号或儿童已切换，未继续保存上一空间的绘本。" };
  async function reconcile(): Promise<StorybookSaveOutcome | null> {
    if (!current()) return superseded;
    try {
      const stored = await deadline(signal => getStorybook(pending.input.storybookId, { signal }), timeoutMs);
      if (!current()) return superseded;
      if (matchesSaved(stored, pending)) return { status: "saved", message: "已核实这本绘本此前保存成功，未重复提交。" };
      if (canAdvanceSavedStorybook(stored, pending)) return null;
      return { status: "unknown", message: "服务端已有这本绘本的另一版本，未覆盖；请刷新后读取已保存版本。" };
    } catch (error) {
      if (!current()) return superseded;
      if (error instanceof ApiClientError && error.status === 404) return null;
      return { status: "unknown", message: "暂时无法确认服务端保存结果。已保留当前绘本；网络恢复后可重试保存，不会重新生成。" };
    }
  }
  if (!current()) return superseded;
  if (options.reconcileFirst) { const result = await reconcile(); if (result) return result; }
  if (!current()) return superseded;
  try {
    const stored = await deadline(signal => upsertStorybook(pending.input, { signal }), timeoutMs);
    if (!current()) return superseded;
    return matchesSaved(stored, pending)
      ? { status: "saved", message: "绘本已保存，刷新或更换设备后可继续阅读。" }
      : { status: "unknown", message: "保存响应与当前绘本不一致，已保留原始正文；请重试保存以先核实服务端版本。" };
  } catch (error) {
    if (!current()) return superseded;
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) return { status: "failed", message: `绘本保存失败：${error.message}。未重新生成。` };
    const confirmed = await reconcile();
    return confirmed ?? { status: "failed", message: "绘本已生成，但服务端尚未保存。请点击“重试保存”；此操作仅保存原结果，不会重新生成。" };
  }
}
