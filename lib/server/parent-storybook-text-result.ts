import "server-only";
import type { SessionUser } from "@/lib/auth/accounts";
import type { ParentStoryBookRequest } from "@/lib/ai/types";
import { withPersistentAiResult, type AiResultStore } from "@/lib/server/ai-result-cache";

/** 文字与媒体分开记账；尚未拿到文字回执时也先持久 claim，未知结果不自动重发。 */
export function withParentStoryBookTextResult(
  input: { session: SessionUser; childId: string; payload: ParentStoryBookRequest; dataVersion: string },
  generate: () => Promise<Response>,
  options: { cacheOnly?: boolean; confirmRetryUnknown?: boolean; store?: AiResultStore; now?: () => number } = {},
) {
  return withPersistentAiResult({
    session: input.session, capability: "parent-storybook", scopeId: input.childId,
    input: { version: 1, payload: input.payload, dataVersion: input.dataVersion },
  }, generate, options);
}
