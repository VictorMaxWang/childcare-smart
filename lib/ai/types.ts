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

export interface WeeklyReportSnapshot {
  institutionName?: string;
  reportDate: string;
  childrenCount: number;
  attendance: {
    presentCount: number;
    absentCount: number;
    attendanceRate: number;
  };
  health: {
    abnormalCount: number;
    missingCount: number;
    topSignals: string[];
  };
  meals: {
    balancedRate: number;
    hydrationAvg: number;
    monotonyRiskCount: number;
    lowHydrationChildren: string[];
    lowVegChildren: string[];
  };
  growth: {
    attentionCount: number;
    pendingReviewCount: number;
    topCategories: Array<{ category: string; count: number }>;
  };
  feedback: {
    count: number;
    pendingTonightCount: number;
  };
  highlights: string[];
}

export interface WeeklyReportPayload {
  snapshot: WeeklyReportSnapshot;
}

export interface WeeklyReportResponse {
  overview: string;
  highlights: string[];
  risks: string[];
  nextWeekFocus: string[];
  managementTip: string;
  source: "ai" | "fallback";
  model?: string;
}

export interface AiSuggestionResponse {
  riskLevel: AiRiskLevel;
  summary: string;
  highlights: string[];
  concerns: string[];
  actions: string[];
  actionPlan?: AiActionPlan;
  disclaimer: string;
  source: "ai" | "fallback";
  model?: string;
}
