export type AiRiskLevel = "low" | "medium" | "high";
export type AiTrendPrediction = "up" | "stable" | "down";

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
  recentDetails?: {
    health: Array<{
      date: string;
      temperature: number;
      mood: string;
      handMouthEye: "正常" | "异常";
      isAbnormal: boolean;
      remark?: string;
    }>;
    meals: Array<{
      date: string;
      meal: string;
      foods: string[];
      waterMl: number;
      preference: string;
      allergyReaction?: string;
    }>;
    growth: Array<{
      createdAt: string;
      category: string;
      description: string;
      needsAttention: boolean;
      followUpAction?: string;
      reviewStatus?: string;
    }>;
    feedback: Array<{
      date: string;
      status: string;
      content: string;
    }>;
  };
  ruleFallback: RuleFallbackItem[];
}

export interface AiSuggestionPayload {
  snapshot: ChildSuggestionSnapshot;
}

export interface AiActionPlan {
  schoolActions: string[];
  familyActions: string[];
  reviewActions: string[];
}

export interface AiSuggestionResponse {
  riskLevel: AiRiskLevel;
  summary: string;
  highlights: string[];
  concerns: string[];
  actions: string[];
  actionPlan?: AiActionPlan;
  trendPrediction?: AiTrendPrediction;
  disclaimer: string;
  source: "ai" | "fallback";
  model?: string;
}

export interface AiFollowUpPayload {
  snapshot: ChildSuggestionSnapshot;
  suggestionTitle: string;
  suggestionDescription?: string;
  question: string;
  history?: AiFollowUpMessage[];
}

export interface AiFollowUpMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiFollowUpResponse {
  answer: string;
  keyPoints: string[];
  nextSteps: string[];
  disclaimer: string;
  source: "ai" | "fallback";
  model?: string;
}

export interface WeeklyReportSnapshot {
  institutionName: string;
  periodLabel: string;
  role: string;
  overview: {
    visibleChildren: number;
    attendanceRate: number;
    mealRecordCount: number;
    healthAbnormalCount: number;
    growthAttentionCount: number;
    pendingReviewCount: number;
    feedbackCount: number;
  };
  diet: {
    balancedRate: number;
    hydrationAvg: number;
    monotonyDays: number;
    vegetableDays: number;
    proteinDays: number;
  };
  topAttentionChildren: Array<{
    childName: string;
    attentionCount: number;
    hydrationAvg: number;
    vegetableDays: number;
  }>;
  highlights: string[];
  risks: string[];
}

export interface WeeklyReportPayload {
  snapshot: WeeklyReportSnapshot;
}

export interface WeeklyReportResponse {
  summary: string;
  highlights: string[];
  risks: string[];
  nextWeekActions: string[];
  trendPrediction: AiTrendPrediction;
  disclaimer: string;
  source: "ai" | "fallback";
  model?: string;
}
