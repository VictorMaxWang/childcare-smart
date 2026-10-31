import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2";
import type { SessionUser } from "@/lib/auth/accounts";
import { decodeDatabaseJson, getDatabasePool } from "@/lib/db/server";
import { logSecurityEvent } from "@/lib/server/security-log";

type StoredResponse = { body: unknown; status: number; headers: Record<string, string> };
type CacheState = "pending" | "completed" | "failed" | "unknown";
export type AiResultEntry = {
  state: CacheState;
  owner: string;
  response: StoredResponse | null;
  expiresAt: number;
};
export interface AiResultStore {
  read(key: string): Promise<AiResultEntry | null>;
  claim(key: string, owner: string, expiresAt: number): Promise<boolean>;
  reclaimUnknown?(key: string, owner: string, expiresAt: number): Promise<boolean>;
  finish(key: string, owner: string, state: CacheState, response: StoredResponse | null, expiresAt: number): Promise<void>;
}
export type AiResultContext = {
  session: SessionUser;
  capability: "suggestions" | "weekly-report" | "parent-storybook";
  scopeId: string;
  input: unknown;
};
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const inFlight = new Map<string, Promise<StoredResponse>>();
let lastCleanupAt = 0;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/** 仅使用已鉴权并由服务端重建的输入；令牌、密钥和客户端快照不参与缓存。 */
export function buildAiResultKey(context: AiResultContext, identity = {
  provider: process.env.AI_PROVIDER || process.env.BRAIN_PROVIDER || "legacy",
  model: process.env.AI_TEXT_MODEL || process.env.BAILIAN_MODEL || process.env.VIVO_LLM_MODEL || "default",
  endpoint: process.env.AI_BASE_URL || process.env.BAILIAN_ENDPOINT || "legacy",
}, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return createHash("sha256").update(JSON.stringify(canonical({
    version: 1, institution: context.session.institutionId, user: context.session.id,
    role: context.session.role, accountKind: context.session.accountKind,
    capability: context.capability, scope: context.scopeId, input: context.input, identity, day,
  }))).digest("hex");
}

export const mysqlAiResultStore: AiResultStore = {
  async read(key) {
    const [rows] = await getDatabasePool().execute("select status, owner_token, response_json, expires_at from ai_result_cache where cache_key = ? limit 1", [key]);
    const row = (rows as Array<{ status: CacheState; owner_token: string; response_json: unknown; expires_at: Date }>)[0];
    return row ? { state: row.status, owner: row.owner_token, response: decodeDatabaseJson<StoredResponse>(row.response_json), expiresAt: new Date(row.expires_at).getTime() } : null;
  },
  async claim(key, owner, expiresAt) {
    if (Date.now() - lastCleanupAt > 60_000) {
      await getDatabasePool().execute("delete from ai_result_cache where status in ('completed', 'failed') and expires_at < current_timestamp(3) limit 100");
      lastCleanupAt = Date.now();
    }
    // 未完成的调用过期后也不重新发出：进程崩溃时，上游可能已经计费。
    await getDatabasePool().execute("delete from ai_result_cache where cache_key = ? and status in ('completed', 'failed') and expires_at < current_timestamp(3)", [key]);
    const [result] = await getDatabasePool().execute<ResultSetHeader>("insert ignore into ai_result_cache (cache_key, status, owner_token, expires_at) values (?, 'pending', ?, ?)", [key, owner, new Date(expiresAt)]);
    return result.affectedRows === 1;
  },
  async finish(key, owner, state, response, expiresAt) {
    await getDatabasePool().execute("update ai_result_cache set status = ?, response_json = ?, expires_at = ?, updated_at = current_timestamp(3) where cache_key = ? and owner_token = ?", [state, response ? JSON.stringify(response) : null, new Date(expiresAt), key, owner]);
  },
  async reclaimUnknown(key, owner, expiresAt) {
    const [result] = await getDatabasePool().execute<ResultSetHeader>("update ai_result_cache set status = 'pending', owner_token = ?, response_json = null, expires_at = ?, updated_at = current_timestamp(3) where cache_key = ? and (status = 'unknown' or (status = 'pending' and expires_at < current_timestamp(3)))", [owner, new Date(expiresAt), key]);
    return result.affectedRows === 1;
  },
};

function controlledResponse(status: number, code: string, error: string, state: string): StoredResponse {
  return { status, body: { ok: false, code, error }, headers: { "x-ai-cache": state, "retry-after": "2" } };
}
function cacheMiss(): StoredResponse {
  // 查询成功但没有生成结果，不用 404/503 制造页面资源错误，也不伪造 AI 内容。
  return { status: 200, body: { ok: true, cacheStatus: "miss", data: null }, headers: { "x-ai-cache": "miss" } };
}
function materialize(result: StoredResponse, state?: string) {
  const headers = new Headers(result.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  headers.set("vary", "Cookie");
  if (state) headers.set("x-ai-cache", state);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}
async function storeResponse(response: Response): Promise<StoredResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { if (key.startsWith("x-smartchildcare") || key === "retry-after") headers[key] = value; });
  return { body: await response.json(), status: response.status, headers };
}

/** 在权限及 scope 校验之后调用；cacheOnly 绝不启动新的收费生成。 */
export async function withPersistentAiResult(
  context: AiResultContext,
  generate: () => Promise<Response>,
  options: { cacheOnly?: boolean; confirmRetryUnknown?: boolean; store?: AiResultStore; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  const key = buildAiResultKey(context, undefined, new Date(now()));
  const local = inFlight.get(key);
  if (local) return options.cacheOnly
    ? materialize(controlledResponse(503, "generation_in_progress", "已有生成任务正在处理，请稍后查看。", "pending"))
    : materialize(await local, "coalesced");
  // 演示账号不写真实结果表；首页也不会自动触发模型。
  if (context.session.accountKind === "demo") {
    return options.cacheOnly
      ? materialize(cacheMiss())
      : generate();
  }
  const store = options.store ?? mysqlAiResultStore;
  let existing: AiResultEntry | null;
  try { existing = await store.read(key); } catch (error) {
    logSecurityEvent("error", "ai.result_cache.read_failed", { error });
    return materialize(controlledResponse(503, "provider_unavailable", "AI 结果存储暂不可用，尚未发起生成。", "storage-unavailable"));
  }
  const concurrent = inFlight.get(key);
  if (concurrent) return options.cacheOnly
    ? materialize(controlledResponse(503, "generation_in_progress", "已有生成任务正在处理，请稍后查看。", "pending"))
    : materialize(await concurrent, "coalesced");
  if (existing?.state === "completed" && existing.response && existing.expiresAt > now()) return materialize(existing.response, "hit");
  const unknown = existing?.state === "unknown" || existing?.state === "pending" && existing.expiresAt <= now();
  if ((existing?.state === "pending" || existing?.state === "unknown") && !(unknown && options.confirmRetryUnknown && !options.cacheOnly)) {
    return materialize(existing.expiresAt > now() && existing.state === "pending"
      ? controlledResponse(503, "generation_in_progress", "已有生成任务正在处理，请稍后查看。", "pending")
      : controlledResponse(503, "generation_result_unknown", "上次生成的结果尚未确认，为避免重复计费未自动重发。", "unknown"));
  }
  if (options.cacheOnly) return materialize(cacheMiss());
  if (existing?.state === "failed" && existing.response && existing.expiresAt > now()) return materialize(existing.response, "recent-failure");
  const owner = randomUUID();
  try {
    const claimed = unknown && options.confirmRetryUnknown
      ? await store.reclaimUnknown?.(key, owner, now() + LEASE_MS)
      : await store.claim(key, owner, now() + LEASE_MS);
    if (!claimed) {
      const winner = inFlight.get(key);
      return winner ? materialize(await winner, "coalesced") : materialize(controlledResponse(503, "generation_in_progress", "已有生成任务正在处理，请稍后查看。", "pending"));
    }
    if (unknown) logSecurityEvent("info", "ai.result_cache.explicit_retry", { capability: context.capability });
  } catch (error) {
    logSecurityEvent("error", "ai.result_cache.claim_failed", { error });
    return materialize(controlledResponse(503, "provider_unavailable", "AI 任务存储暂不可用，尚未发起生成。", "storage-unavailable"));
  }
  const pending = (async () => {
    let result: StoredResponse;
    let state: CacheState = "unknown";
    try {
      result = await storeResponse(await generate());
      const body = result.body && typeof result.body === "object" ? result.body as Record<string, unknown> : {};
      const fallback = body.fallback === true || body.ok === false || ["mock", "fallback", "rule"].includes(String(body.source));
      state = result.status === 200 && !fallback ? "completed" : result.status === 200 || [400, 401, 403, 404, 422, 429].includes(result.status) ? "failed" : "unknown";
      await store.finish(key, owner, state, result, now() + (state === "failed" ? 30_000 : RESULT_TTL_MS));
      return result;
    } catch (error) {
      logSecurityEvent("error", "ai.result_cache.generation_unconfirmed", { error });
      await store.finish(key, owner, "unknown", null, now() + RESULT_TTL_MS).catch(() => undefined);
      return controlledResponse(503, "generation_result_unknown", "生成结果尚未确认，为避免重复计费未自动重发。", "unknown");
    }
  })();
  inFlight.set(key, pending);
  try { return materialize(await pending, "generated"); } finally { inFlight.delete(key); }
}
