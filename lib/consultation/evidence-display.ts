import type {
  ConsultationEvidenceCategory,
  ConsultationEvidenceConfidence,
  ConsultationEvidenceItem,
  ConsultationEvidenceSupportRef,
  ExplainabilityItem,
} from "@/lib/ai/types";

export const CONSULTATION_EVIDENCE_CATEGORY_ORDER: ConsultationEvidenceCategory[] = [
  "risk_control",
  "family_communication",
  "daily_care",
  "development_support",
];

export interface ConsultationEvidenceDisplayItem {
  item: ConsultationEvidenceItem;
  supportLabels: string[];
}

export interface ConsultationEvidenceDisplayGroup {
  category: ConsultationEvidenceCategory;
  label: string;
  items: ConsultationEvidenceDisplayItem[];
}

export interface ConsultationEvidenceFallbackItem {
  label: string;
  detail: string;
  source: "evidenceHighlights" | "explainability";
}

export interface ConsultationEvidencePanelModel {
  mode: "structured" | "fallback" | "empty";
  leadItems: ConsultationEvidenceDisplayItem[];
  groupedRemainder: ConsultationEvidenceDisplayGroup[];
  fallbackItems: ConsultationEvidenceFallbackItem[];
}

const SUPPORT_RANK: Record<ConsultationEvidenceSupportRef["type"], number> = {
  finding: 0,
  action: 1,
  explainability: 2,
};

const CONFIDENCE_RANK: Record<ConsultationEvidenceConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const CATEGORY_RANK = CONSULTATION_EVIDENCE_CATEGORY_ORDER.reduce<
  Record<ConsultationEvidenceCategory, number>
>((acc, category, index) => {
  acc[category] = index;
  return acc;
}, {} as Record<ConsultationEvidenceCategory, number>);

function getBestSupportRank(item: ConsultationEvidenceItem) {
  const ranks = item.supports.map((support) => SUPPORT_RANK[support.type]);
  return ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

function isDerivedEvidence(item: ConsultationEvidenceItem) {
  return item.sourceType === "derived_explainability";
}

function uniqueStrings(items: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const result: string[] = [];

  items.forEach((item) => {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result.slice(0, limit);
}

function buildDisplayItems(items: ConsultationEvidenceItem[]) {
  return items.map((item) => ({
    item,
    supportLabels: uniqueStrings(item.supports.map((support) => formatConsultationEvidenceSupportLabel(support))),
  }));
}

function groupDisplayItemsByCategory(
  items: ConsultationEvidenceDisplayItem[]
): ConsultationEvidenceDisplayGroup[] {
  const buckets = new Map<ConsultationEvidenceCategory, ConsultationEvidenceDisplayItem[]>();

  items.forEach((displayItem) => {
    const existing = buckets.get(displayItem.item.evidenceCategory);
    if (existing) {
      existing.push(displayItem);
      return;
    }
    buckets.set(displayItem.item.evidenceCategory, [displayItem]);
  });

  return CONSULTATION_EVIDENCE_CATEGORY_ORDER.flatMap((category) => {
    const groupedItems = buckets.get(category);
    if (!groupedItems || groupedItems.length === 0) return [];

    return [
      {
        category,
        label: getConsultationEvidenceCategoryLabel(category),
        items: groupedItems,
      },
    ];
  });
}

function buildFallbackItems(params: {
  evidenceHighlights?: string[];
  explainability?: ExplainabilityItem[];
}) {
  const evidenceHighlights = uniqueStrings(params.evidenceHighlights ?? [], 6);
  if (evidenceHighlights.length > 0) {
    return evidenceHighlights.map((detail) => ({
      label: "兼容摘要",
      detail,
      source: "evidenceHighlights" as const,
    }));
  }

  return uniqueStrings(
    (params.explainability ?? []).map((item) =>
      item.detail ? `${item.label || "说明"}：${item.detail}` : ""
    ),
    6
  ).map((detail) => ({
    label: "兼容说明",
    detail,
    source: "explainability" as const,
  }));
}

export function getConsultationEvidenceCategoryLabel(category: ConsultationEvidenceCategory) {
  switch (category) {
    case "risk_control":
      return "风险控制";
    case "family_communication":
      return "家庭沟通";
    case "daily_care":
      return "日常照护";
    case "development_support":
      return "发展支持";
    default:
      return category;
  }
}

export function getConsultationEvidenceConfidenceLabel(confidence: ConsultationEvidenceConfidence) {
  switch (confidence) {
    case "high":
      return "高置信";
    case "medium":
      return "中置信";
    case "low":
      return "低置信";
    default:
      return confidence;
  }
}

export function getConsultationEvidenceHumanReviewLabel(requiresHumanReview: boolean) {
  return requiresHumanReview ? "需人工复核" : "可直接采信";
}

export function formatConsultationEvidenceSupportLabel(ref: ConsultationEvidenceSupportRef) {
  const prefix =
    ref.type === "finding"
      ? "支持发现"
      : ref.type === "action"
        ? "支持动作"
        : "说明依据";

  return ref.targetLabel ? `${prefix}·${ref.targetLabel}` : prefix;
}

export function sortConsultationEvidenceItems(items: ConsultationEvidenceItem[]) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const supportRankDelta = getBestSupportRank(left.item) - getBestSupportRank(right.item);
      if (supportRankDelta !== 0) return supportRankDelta;

      const confidenceDelta =
        CONFIDENCE_RANK[left.item.confidence] - CONFIDENCE_RANK[right.item.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;

      const reviewDelta =
        Number(left.item.requiresHumanReview) - Number(right.item.requiresHumanReview);
      if (reviewDelta !== 0) return reviewDelta;

      const derivedDelta = Number(isDerivedEvidence(left.item)) - Number(isDerivedEvidence(right.item));
      if (derivedDelta !== 0) return derivedDelta;

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function groupConsultationEvidenceItemsByCategory(items: ConsultationEvidenceItem[]) {
  return groupDisplayItemsByCategory(buildDisplayItems(sortConsultationEvidenceItems(items)));
}

export function buildConsultationEvidencePanelModel(params: {
  evidenceItems: ConsultationEvidenceItem[];
  evidenceHighlights?: string[];
  explainability?: ExplainabilityItem[];
  leadLimit: number;
}): ConsultationEvidencePanelModel {
  const sortedItems = sortConsultationEvidenceItems(params.evidenceItems);

  if (sortedItems.length > 0) {
    const leadItems = buildDisplayItems(sortedItems.slice(0, params.leadLimit));
    const groupedRemainder = groupDisplayItemsByCategory(
      buildDisplayItems(sortedItems.slice(params.leadLimit))
    );

    return {
      mode: "structured",
      leadItems,
      groupedRemainder,
      fallbackItems: [],
    };
  }

  const fallbackItems = buildFallbackItems({
    evidenceHighlights: params.evidenceHighlights,
    explainability: params.explainability,
  });

  if (fallbackItems.length > 0) {
    return {
      mode: "fallback",
      leadItems: [],
      groupedRemainder: [],
      fallbackItems,
    };
  }

  return {
    mode: "empty",
    leadItems: [],
    groupedRemainder: [],
    fallbackItems: [],
  };
}

export function getConsultationEvidenceCategoryRank(category: ConsultationEvidenceCategory) {
  return CATEGORY_RANK[category];
}
