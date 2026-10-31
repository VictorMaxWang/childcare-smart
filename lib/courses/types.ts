export type CourseModule = "nutrition" | "psychology" | "movement";
export const COURSE_MODULE_LABELS: Record<CourseModule, string> = {
  nutrition: "营养教育", psychology: "心理健康支持", movement: "体育活动指导",
};
export type CourseFeedback = "helpful" | "not-helpful" | "too-long" | "tried";
export interface CareCourse {
  id: string;
  version: string;
  module: CourseModule;
  title: string;
  summary: string;
  minAgeMonths: number;
  maxAgeMonths: number;
  goals: string[];
  purpose: "explain" | "demonstrate" | "practice";
  cards: { title: string; body: string }[];
  question: { prompt: string; choices: string[]; answer: number; explanation: string };
  practice: string;
  estimatedMinutes: number;
  video: {
    url: string;
    title: string;
    author: string;
    durationSeconds: number | null;
    discoveredAt: string;
    verifiedAt: string | null;
    verificationStatus: "verified" | "pending" | "unavailable";
    evidence: string;
  };
}
export interface CourseLearningEvent {
  requestId: string;
  courseId: string;
  courseVersion: string;
  type: "opened" | "answer" | "practice" | "feedback";
  answer?: number;
  completed?: boolean;
  feedback?: CourseFeedback;
  note?: string;
  recommendationJobId?: string;
  createdAt?: string;
}
export interface CourseRecommendation {
  courseIds: string[];
  reason: string;
  goals: string[];
  score: { total: number; coverage: number; relevance: number; complementarity: number; preference: number; redundancy: number; durationSeconds: number };
  algorithmVersion: string;
  model: string;
  embeddingModel: string;
  embeddingDimension: number;
  reused: boolean;
}
export interface CourseRecommendationJob {
  jobId: string;
  requestId: string;
  childId: string;
  status: "pending" | "running" | "completed" | "failed" | "unknown";
  result: CourseRecommendation | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}
