import type { KnowledgeEntry } from "@/lib/ai/types";
import entriesSource from "@/docs/knowledge/childcare/entries.json";

export interface ChildcareKnowledgeSearchQuery {
  topic?: string | string[] | null;
  scenario?: string | string[] | null;
  ageRange?: string | null;
  text?: string | string[] | null;
  limit?: number;
}

type AgeRangeBounds = {
  start: number;
  end: number;
};

export const CHILDCARE_KNOWLEDGE_ENTRIES: KnowledgeEntry[] = entriesSource as KnowledgeEntry[];

const FALLBACK_KNOWLEDGE_ENTRY: KnowledgeEntry = {
  id: "ckb-fallback-care-boundary-v1",
  topic: "托育观察边界",
  ageRange: "0-36m",
  scenario: "未匹配到具体托育主题时的通用提示",
  principle: "先回到安全、回应性照护、事实记录和人工复核，不把零散信号直接解释为诊断结论。",
  suggestedAction: "记录可观察事实、发生频次、持续时间、触发场景和成人回应方式，再由教师、园长与家长共同确认下一步。",
  riskBoundary: "如出现持续发热、精神状态明显异常、呼吸异常、呕吐腹泻、伤害风险或发展疑虑，应优先进入机构健康安全流程并联系家长或专业人员。",
  sourceNote:
    "参考国家卫生健康委《托育机构保育指导大纲（试行）》关于安全健康、积极回应、家园合作和个体差异的原则；本条为演示知识库骨架通用提示。",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function toQueryTerms(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(normalizeText).filter(Boolean);
}

function parseAgeRange(value: string | null | undefined): AgeRangeBounds | null {
  const normalized = normalizeText(value).replace(/个月|月/g, "m");
  const match = normalized.match(/(\d+)\D+(\d+)m?/);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function ageRangesOverlap(entryRange: string, queryRange?: string | null) {
  const query = parseAgeRange(queryRange);
  if (!query) return true;

  const entry = parseAgeRange(entryRange);
  if (!entry) return true;

  return Math.max(entry.start, query.start) <= Math.min(entry.end, query.end);
}

function includesAny(haystack: string, terms: string[]) {
  return terms.some((term) => haystack.includes(term) || term.includes(haystack));
}

function scoreEntry(entry: KnowledgeEntry, query: ChildcareKnowledgeSearchQuery) {
  if (!ageRangesOverlap(entry.ageRange, query.ageRange)) return Number.NEGATIVE_INFINITY;

  const topicTerms = toQueryTerms(query.topic);
  const scenarioTerms = [...toQueryTerms(query.scenario), ...toQueryTerms(query.text)];
  const entryTopic = normalizeText(entry.topic);
  const entryScenario = normalizeText(entry.scenario);
  const entryText = normalizeText(
    [entry.topic, entry.scenario, entry.principle, entry.suggestedAction, entry.riskBoundary].join(" ")
  );
  let score = 0;

  if (topicTerms.length > 0) {
    if (topicTerms.includes(entryTopic)) score += 8;
    else if (includesAny(entryText, topicTerms)) score += 5;
  }

  if (scenarioTerms.length > 0) {
    if (includesAny(entryScenario, scenarioTerms)) score += 4;
    else if (includesAny(entryText, scenarioTerms)) score += 2;
  }

  if (query.ageRange && ageRangesOverlap(entry.ageRange, query.ageRange)) {
    score += entry.ageRange === query.ageRange ? 3 : 1;
  }

  if (topicTerms.length === 0 && scenarioTerms.length === 0 && !query.ageRange) {
    score = 1;
  }

  return score;
}

export function findChildcareKnowledgeEntries(
  query: ChildcareKnowledgeSearchQuery = {}
): KnowledgeEntry[] {
  const limit = Math.max(1, query.limit ?? CHILDCARE_KNOWLEDGE_ENTRIES.length);

  return CHILDCARE_KNOWLEDGE_ENTRIES.map((entry, index) => ({
    entry,
    index,
    score: scoreEntry(entry, query),
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.entry);
}

export function getChildcareKnowledgeHints(
  query: ChildcareKnowledgeSearchQuery = {}
): KnowledgeEntry[] {
  const limit = Math.max(1, query.limit ?? 3);
  const matches = findChildcareKnowledgeEntries({ ...query, limit });

  return matches.length > 0 ? matches : [FALLBACK_KNOWLEDGE_ENTRY];
}
