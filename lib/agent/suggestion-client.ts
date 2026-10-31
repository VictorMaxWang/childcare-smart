import type { AiSuggestionResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";
import type { CachedAiRequestOptions } from "@/lib/ai/cached-ai-request";

/** 缓存未命中属于正常空态，不伪造建议，也不在客户端自动追加收费请求。 */
export async function fetchSuggestionResponse(snapshot: ChildSuggestionSnapshot, options: CachedAiRequestOptions): Promise<AiSuggestionResponse | null> {
  const response = await fetch("/api/ai/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.cacheOnly ? { "x-ai-cache-only": "1" } : {}),
      ...(options.confirmRetryUnknown ? { "x-ai-confirm-retry": "1" } : {}) },
    body: JSON.stringify({ snapshot }), signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string; code?: string } | null;
    throw Object.assign(new Error(body?.message ?? body?.error ?? "建议暂时无法读取。"), { code: body?.code });
  }
  if (response.headers.get("x-ai-cache") === "miss") return null;
  return await response.json() as AiSuggestionResponse;
}
