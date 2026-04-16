import type { AiFollowUpMessage, InstitutionSuggestionSnapshot, MemoryContextMeta } from "@/lib/ai/types";
import type { TaskEscalationSuggestion, TaskSourceType } from "@/lib/tasks/types";

export type AdminAgentWorkflowType = "daily-priority" | "question-follow-up" | "weekly-ops-report";
export type InstitutionPriorityTargetType = "child" | "class" | "issue" | "family";
export type InstitutionPriorityLevel = "P1" | "P2" | "P3";
export type AdminDispatchEventStatus = "pending" | "in_progress" | "completed";
export type AdminOwnerRole = "teacher" | "parent" | "admin";

export interface AdminAgentUserSnapshot {
  name: string;
  institutionName?: string;
  institutionId?: string;
  role?: string;
}

export interface AdminAgentChildSnapshot {
  id: string;
  name: string;
  birthDate: string;
  className: string;
  allergies: string[];
  specialNotes: string;
  parentUserId?: string;
}

export interface AdminAgentAttendanceSnapshot {
  id: string;
  childId: string;
  date: string;
  isPresent: boolean;
}

export interface AdminAgentHealthCheckSnapshot {
  id: string;
  childId: string;
  date: string;
  temperature: number;
  mood: string;
  handMouthEye: "正常" | "异常";
  isAbnormal: boolean;
  remark?: string;
}

export interface AdminAgentGrowthSnapshot {
  id: string;
  childId: string;
  createdAt: string;
  category: string;
  tags: string[];
  description: string;
  needsAttention: boolean;
  followUpAction?: string;
  reviewDate?: string;
  reviewStatus?: "待复查" | "已完成";
}

export interface AdminAgentGuardianFeedbackSnapshot {
  id: string;
  childId: string;
  date: string;
  status: string;
  content: string;
  interventionCardId?: string;
  sourceWorkflow?: "parent-agent" | "teacher-agent" | "manual";
  executed?: boolean;
  childReaction?: string;
  improved?: boolean | "unknown";
  freeNote?: string;
}

export interface AdminAgentMealFoodSnapshot {
  name: string;
  category: string;
  amount: string;
}

export interface AdminAgentMealSnapshot {
  id: string;
  childId: string;
  date: string;
  meal: string;
  foods: AdminAgentMealFoodSnapshot[];
  waterMl: number;
  preference?: string;
  allergyReaction?: string;
}

export interface AdminAgentSmartInsightSnapshot {
  id: string;
  title: string;
  description: string;
  level: "success" | "warning" | "info";
  tags: string[];
  childId?: string;
}

export interface AdminAgentBoardSnapshot {
  highAttentionChildren: Array<{ childId: string; childName: string; count: number }>;
  lowHydrationChildren: Array<{ childId: string; childName: string; hydrationAvg: number }>;
  lowVegTrendChildren: Array<{ childId: string; childName: string; vegetableDays: number }>;
}

export interface AdminAgentWeeklyTrendSnapshot {
  balancedRate: number;
  vegetableDays: number;
  proteinDays: number;
  stapleDays: number;
  hydrationAvg: number;
  monotonyDays: number;
}

export interface AdminDispatchCreatePayload {
  eventType: string;
  priorityItemId: string;
  title: string;
  summary: string;
  targetType: InstitutionPriorityTargetType;
  targetId: string;
  targetName: string;
  priorityLevel: InstitutionPriorityLevel;
  priorityScore: number;
  recommendedOwnerRole: AdminOwnerRole;
  recommendedOwnerName?: string;
  recommendedAction: string;
  recommendedDeadline: string;
  reasonText: string;
  evidence: InstitutionPriorityEvidence[];
  source: {
    institutionName: string;
    workflow: AdminAgentWorkflowType;
    relatedChildIds?: string[];
    relatedClassNames?: string[];
    consultationId?: string;
    relatedConsultationIds?: string[];
    taskId?: string;
    sourceType?: TaskSourceType;
    sourceId?: string;
    relatedTaskIds?: string[];
    escalation?: TaskEscalationSuggestion;
  };
}

export interface AdminDispatchUpdatePayload {
  id: string;
  status?: AdminDispatchEventStatus;
  recommendedOwnerName?: string;
  summary?: string;
  completedAt?: string | null;
}

export interface AdminDispatchEvent {
  id: string;
  institutionId: string;
  eventType: string;
  status: AdminDispatchEventStatus;
  priorityItemId?: string;
  title: string;
  summary: string;
  targetType: InstitutionPriorityTargetType;
  targetId: string;
  targetName: string;
  priorityLevel: InstitutionPriorityLevel;
  priorityScore: number;
  recommendedOwnerRole: AdminOwnerRole;
  recommendedOwnerName?: string;
  recommendedAction: string;
  recommendedDeadline: string;
  reasonText: string;
  evidence: InstitutionPriorityEvidence[];
  source: {
    institutionName?: string;
    workflow?: AdminAgentWorkflowType | string;
    relatedChildIds?: string[];
    relatedClassNames?: string[];
    consultationId?: string;
    relatedConsultationIds?: string[];
    taskId?: string;
    sourceType?: TaskSourceType;
    sourceId?: string;
    relatedTaskIds?: string[];
    escalation?: TaskEscalationSuggestion;
  } | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface InstitutionPriorityEvidence {
  label: string;
  value: string;
  weight: number;
  detail?: string;
}

export interface InstitutionPriorityRecommendedOwner {
  role: AdminOwnerRole;
  label: string;
  className?: string;
  childName?: string;
}

export interface InstitutionPriorityItem {
  id: string;
  targetType: InstitutionPriorityTargetType;
  targetId: string;
  targetName: string;
  priorityScore: number;
  priorityLevel: InstitutionPriorityLevel;
  reason: string;
  evidence: InstitutionPriorityEvidence[];
  recommendedOwner: InstitutionPriorityRecommendedOwner;
  recommendedAction: string;
  recommendedDeadline: string;
  relatedChildIds: string[];
  relatedClassNames: string[];
  dispatchPayload: AdminDispatchCreatePayload;
}

export interface InstitutionScopeSummary {
  institutionName: string;
  date: string;
  visibleChildren: number;
  classCount: number;
  todayPresentCount: number;
  todayAttendanceRate: number;
  attendanceRate: number;
  healthAbnormalCount: number;
  growthAttentionCount: number;
  pendingReviewCount: number;
  feedbackCount: number;
  feedbackCompletionRate: number;
  riskChildrenCount: number;
  riskClassCount: number;
  pendingDispatchCount: number;
}

export interface AdminRiskChildSummary {
  childId: string;
  childName: string;
  className: string;
  priorityLevel: InstitutionPriorityLevel;
  priorityScore: number;
  reason: string;
  ownerLabel: string;
  deadline: string;
}

export interface AdminRiskClassSummary {
  className: string;
  priorityLevel: InstitutionPriorityLevel;
  priorityScore: number;
  reason: string;
  issueCount: number;
  ownerLabel: string;
  deadline: string;
}

export interface AdminFeedbackRiskSummary {
  childId: string;
  childName: string;
  className: string;
  priorityLevel: InstitutionPriorityLevel;
  reason: string;
  lastFeedbackDate?: string;
  recommendedOwner: string;
}

export interface AdminAgentActionItem {
  id: string;
  title: string;
  targetType: InstitutionPriorityTargetType;
  targetId: string;
  targetName: string;
  priorityLevel: InstitutionPriorityLevel;
  ownerRole: AdminOwnerRole;
  ownerLabel: string;
  action: string;
  deadline: string;
  summary: string;
  dispatchPayload: AdminDispatchCreatePayload;
  status: "suggested" | "created" | "in_progress" | "completed";
  relatedEventId?: string;
}

export interface AdminRecommendedOwnerMapEntry {
  ownerRole: AdminOwnerRole;
  ownerLabel: string;
  count: number;
}

export interface AdminAgentContext {
  institutionScope: InstitutionScopeSummary;
  priorityTopItems: InstitutionPriorityItem[];
  riskChildren: AdminRiskChildSummary[];
  riskClasses: AdminRiskClassSummary[];
  feedbackRiskItems: AdminFeedbackRiskSummary[];
  highlights: string[];
  weeklyHighlights: string[];
  actionItems: AdminAgentActionItem[];
  recommendedOwnerMap: AdminRecommendedOwnerMapEntry[];
  notificationEvents: AdminDispatchEvent[];
  pendingItems: string[];
  quickQuestions: string[];
  suggestionSnapshot: InstitutionSuggestionSnapshot;
  source: "rule";
  generatedAt: string;
}

export interface AdminHomeViewModel {
  riskChildrenCount: number;
  feedbackCompletionRate: number;
  pendingItems: string[];
  weeklySummary: string;
  weeklyHighlights: string[];
  heroStats: Array<{ label: string; value: string }>;
  priorityTopItems: InstitutionPriorityItem[];
  riskChildren: AdminRiskChildSummary[];
  riskClasses: AdminRiskClassSummary[];
  pendingDispatches: AdminDispatchEvent[];
  actionEntrySummary: string;
  adminContext: AdminAgentContext;
}

export interface AdminAgentResult {
  title: string;
  summary: string;
  assistantAnswer: string;
  institutionScope: InstitutionScopeSummary;
  priorityTopItems: InstitutionPriorityItem[];
  riskChildren: AdminRiskChildSummary[];
  riskClasses: AdminRiskClassSummary[];
  feedbackRiskItems: AdminFeedbackRiskSummary[];
  highlights: string[];
  actionItems: AdminAgentActionItem[];
  recommendedOwnerMap: AdminRecommendedOwnerMapEntry[];
  quickQuestions: string[];
  notificationEvents: AdminDispatchEvent[];
  continuityNotes?: string[];
  memoryMeta?: MemoryContextMeta;
  source: "ai" | "fallback" | "mock" | "rule";
  model?: string;
  generatedAt: string;
}

export interface AdminAgentRequestPayload {
  workflow: AdminAgentWorkflowType;
  question?: string;
  history?: AiFollowUpMessage[];
  currentUser: AdminAgentUserSnapshot;
  visibleChildren: AdminAgentChildSnapshot[];
  attendanceRecords: AdminAgentAttendanceSnapshot[];
  healthCheckRecords: AdminAgentHealthCheckSnapshot[];
  growthRecords: AdminAgentGrowthSnapshot[];
  guardianFeedbacks: AdminAgentGuardianFeedbackSnapshot[];
  mealRecords: AdminAgentMealSnapshot[];
  adminBoardData: AdminAgentBoardSnapshot;
  weeklyTrend: AdminAgentWeeklyTrendSnapshot;
  smartInsights: AdminAgentSmartInsightSnapshot[];
  notificationEvents?: AdminDispatchEvent[];
}
