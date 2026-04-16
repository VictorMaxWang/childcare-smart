import type { MemoryContextEnvelope, MemoryContextMeta, PromptMemoryContext } from "@/lib/ai/types";

function takeUnique(items: Array<string | undefined>, limit = 6) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function createEmptyPromptMemoryContext(): PromptMemoryContext {
  return {
    longTermTraits: [],
    recentContinuitySignals: [],
    lastConsultationTakeaways: [],
    openLoops: [],
  };
}

export function createEmptyMemoryMeta(overrides?: Partial<MemoryContextMeta>): MemoryContextMeta {
  return {
    backend: "none",
    degraded: false,
    usedSources: [],
    errors: [],
    matchedSnapshotIds: [],
    matchedTraceIds: [],
    ...overrides,
  };
}

export function createEmptyMemoryContextEnvelope(childId: string, workflowType: string): MemoryContextEnvelope {
  return {
    childId,
    workflowType,
    recentSnapshots: [],
    recentConsultations: [],
    relevantTraces: [],
    promptContext: createEmptyPromptMemoryContext(),
    meta: createEmptyMemoryMeta(),
  };
}

export function mergePromptMemoryContexts(
  contexts: Array<PromptMemoryContext | null | undefined>,
  limit = 8
): PromptMemoryContext {
  return {
    longTermTraits: takeUnique(contexts.flatMap((item) => item?.longTermTraits ?? []), limit),
    recentContinuitySignals: takeUnique(contexts.flatMap((item) => item?.recentContinuitySignals ?? []), limit),
    lastConsultationTakeaways: takeUnique(contexts.flatMap((item) => item?.lastConsultationTakeaways ?? []), limit),
    openLoops: takeUnique(contexts.flatMap((item) => item?.openLoops ?? []), limit),
  };
}

export function buildContinuityNotes(
  subjectLabel: string,
  promptContext?: PromptMemoryContext | null,
  limit = 4
) {
  if (!promptContext) return [];

  return takeUnique(
    [
      promptContext.longTermTraits[0] ? `参考了${subjectLabel}的长期特征：${promptContext.longTermTraits[0]}` : undefined,
      promptContext.lastConsultationTakeaways[0]
        ? `延续了最近一次会诊结论：${promptContext.lastConsultationTakeaways[0]}`
        : undefined,
      promptContext.recentContinuitySignals[0]
        ? `结合了近期连续观察：${promptContext.recentContinuitySignals[0]}`
        : undefined,
      promptContext.openLoops[0] ? `本轮继续盯住：${promptContext.openLoops[0]}` : undefined,
    ],
    limit
  );
}

export function buildPromptMemoryDigest(promptContext?: PromptMemoryContext | null) {
  if (!promptContext) return [];

  return takeUnique(
    [
      ...promptContext.longTermTraits.slice(0, 2).map((item) => `长期画像：${item}`),
      ...promptContext.recentContinuitySignals.slice(0, 2).map((item) => `近期上下文：${item}`),
      ...promptContext.lastConsultationTakeaways.slice(0, 2).map((item) => `最近会诊：${item}`),
      ...promptContext.openLoops.slice(0, 2).map((item) => `待闭环事项：${item}`),
    ],
    6
  );
}
