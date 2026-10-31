import "server-only";

import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { ParentStoryBookResponse } from "@/lib/ai/types";
import {
  attestAiResult,
  verifyAiResultAttestation,
  verifyPersistedStorybookResultAttestation,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import { ApiRouteError } from "@/lib/server/api-errors";
import { canAccessChild, findChild } from "@/lib/server/scope";

type JsonRecord = Record<string, unknown>;
type StoredBook = { storybookId: string; childId: string; pages: JsonRecord[] };
function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function responseIn(pages: JsonRecord[]) {
  return pages.map(page => page.response).find(record) ?? null;
}
function hasRealProvider(value: JsonRecord) {
  return value.fallback !== true && value.mock !== true && record(value.providerMeta) &&
    value.providerMeta.realProvider === true && value.providerMeta.mock !== true;
}

/**
 * 教师离开后家长可接续已保存的书：先检查当前权限，再仅使用数据库中的原回执
 * 验证原签发者，最后为当前阅读者签名。客户端的正文、provider、creator 均不采纳。
 * 没有可信原书时返回 null，交给原路由失败关闭，不升级规则或未验结果。
 */
export function resolveAuthorizedStoredStorybookContinuation(input: {
  user: SessionUser;
  snapshot: Pick<ApiExtendedSnapshot, "children" | "storybooks">;
  storyId: string;
  childId: string;
}) {
  if (!canAccessChild(input.user, findChild(input.snapshot, input.childId))) return null;
  const stored = input.snapshot.storybooks.find(book => book.storybookId === input.storyId && book.childId === input.childId);
  if (!stored) return null;
  const canonical = responseIn(stored.pages);
  if (!canonical || canonical.storyId !== input.storyId || canonical.childId !== input.childId ||
      !hasRealProvider(canonical) || !verifyPersistedStorybookResultAttestation(canonical, {
        institutionId: input.user.institutionId, scopeId: input.childId,
      })) return null;
  return attestAiResult(canonical, {
    userId: input.user.id, institutionId: input.user.institutionId,
    capability: "parent-storybook", scopeId: input.childId,
  }) as unknown as ParentStoryBookResponse;
}

/**
 * 更新在同一快照事务内检查，防止过期阅读回写或未验客户端结果清除已支付媒体。
 * 失败拒绝整个保存并保留原书；不拼接不同签名的字段，也不放宽当前账号验签。
 */
export function assertSafePersistedStorybookUpdate(
  existing: StoredBook | undefined,
  incomingPages: JsonRecord[],
  context: AiProvenanceContext
) {
  if (!existing) return;
  const previous = responseIn(existing.pages);
  if (!previous || !hasRealProvider(previous) || !verifyPersistedStorybookResultAttestation(previous, context)) return;
  const next = responseIn(incomingPages);
  if (!next || next.storyId !== existing.storybookId || next.childId !== existing.childId ||
      !hasRealProvider(next) || !verifyAiResultAttestation(next, context)) {
    throw new ApiRouteError("conflict", "绘本来源验证失败，已保留服务端原版；请重新读取绘本，不要重新生成。");
  }
  const nextScenes = Array.isArray(next.scenes) ? next.scenes.filter(record) : [];
  for (const scene of Array.isArray(previous.scenes) ? previous.scenes.filter(record) : []) {
    const updated = nextScenes.find(candidate => candidate.sceneIndex === scene.sceneIndex);
    for (const channel of ["image", "audio"] as const) {
      const reference = channel === "image" ? "assetRef" : "audioRef";
      if (scene[`${channel}Status`] === "ready" && (scene[`${channel}Url`] || scene[reference]) &&
          (!updated || updated[`${channel}Status`] !== "ready" || !(updated[`${channel}Url`] || updated[reference]))) {
        throw new ApiRouteError("conflict", "该保存版本缺少已完成媒体，已保留服务端原版；请重新读取绘本。");
      }
    }
  }
}
