export type AiRiskLevel = "low" | "medium" | "high";

export interface RuleFallbackItem {
  title: string;
  description: string;
  level?: "success" | "warning" | "info";
  tags?: string[];
}

export interface ChildSuggestionSnapshot {
  child: {
    id: string;
    name: string;
    ageBand?: string;
    className?: string;
    allergies?: string[];
    specialNotes?: string;
  };
  summary: {
    health: {
      abnormalCount: number;
      handMouthEyeAbnormalCount: number;
      avgTemperature?: number;
      moodKeywords?: string[];
    };
    meals: {
      recordCount: number;
      hydrationAvg: number;
      balancedRate: number;
      monotonyDays: number;
      allergyRiskCount: number;
    };
    growth: {
      recordCount: number;
      attentionCount: number;
      pendingReviewCount: number;
      topCategories: Array<{ category: string; count: number }>;
    };
    feedback: {
      count: number;
      statusCounts: Record<string, number>;
      keywords: string[];
    };
  };
  ruleFallback: RuleFallbackItem[];
}

export interface AiSuggestionPayload {
  snapshot: ChildSuggestionSnapshot;
}

export interface AiSuggestionResponse {
  riskLevel: AiRiskLevel;
  highlights: string[];
  concerns: string[];
  actions: string[];
  disclaimer: string;
  source: "ai" | "fallback";
  model?: string;
}
