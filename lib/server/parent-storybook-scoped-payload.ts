import "server-only";
import { createHash } from "node:crypto";
import type { ParentStoryBookHighlightCandidate, ParentStoryBookRequest } from "@/lib/ai/types";
import { getFeedbackBusinessToday, normalizeFeedbackBusinessDate } from "@/lib/feedback/date";
import { buildChildSuggestionSnapshotFromScope } from "@/lib/server/ai-scoped-payloads";
import { ApiRouteError } from "@/lib/server/api-errors";
import { projectFeedbackObservationSemantics } from "@/lib/feedback/observation-semantics";
import type { SessionScope } from "@/lib/server/session-scope";

function text(value: unknown, limit = 1000) {
  return typeof value === "string" ? Array.from(value.trim()).slice(0, limit).join("") : "";
}

function recent<T>(records: T[], childId: string, today: string, readDate: (record: T) => string) {
  const end = Date.parse(`${today}T00:00:00Z`);
  return records.filter(record => {
    if ((record as { childId?: string }).childId !== childId) return false;
    const day = normalizeFeedbackBusinessDate(readDate(record));
    const age = end - Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(age) && age >= 0 && age < 7 * 86400000;
  });
}

function latest<T>(records: T[], readDate: (record: T) => string) {
  return [...records].sort((left, right) => readDate(right).localeCompare(readDate(left)))[0] ?? null;
}

/**
 * 个性化依据完全取自当前授权快照。客户端只可选择主题/画风等创作选项，
 * 不能把自报教师记录、会诊或儿童事实重新签成可信 AI 结果。
 */
export function buildParentStoryBookPayloadFromScope(
  source: ParentStoryBookRequest,
  scope: SessionScope,
  childId: string,
  today = getFeedbackBusinessToday(),
): { payload: ParentStoryBookRequest; dataVersion: string } {
  const scoped = scope.scopedSnapshot;
  const health = recent(scoped.health, childId, today, record => record.date);
  const meals = recent(scoped.meals, childId, today, record => record.date);
  const growth = recent(scoped.growth, childId, today, record => record.createdAt);
  const feedback = recent(scoped.feedback, childId, today, record => record.date || record.submittedAt || "").map(projectFeedbackObservationSemantics);
  const narrowed = { ...scope, scopedSnapshot: { ...scoped, health, meals, growth, feedback } };
  const snapshot = buildChildSuggestionSnapshotFromScope(narrowed, childId, today);
  if (!snapshot || !scope.authorizedChildIds.has(childId)) throw new ApiRouteError("forbidden_scope", "当前账号无权为该儿童生成绘本。");
  const card = latest(scoped.interventionCards.filter(item => item.targetChildId === childId), item => item.updatedAt || item.createdAt || "");
  const consultation = latest(scoped.consultations.filter(item => item.childId === childId), item => item.generatedAt);
  const highlights: ParentStoryBookHighlightCandidate[] = [
    ...growth.slice(-6).map(item => ({ kind: "todayGrowth" as const, title: text(item.category, 80), detail: text(item.description), priority: item.needsAttention ? 3 : 2, source: "authorized-growth-record" })),
    ...feedback.slice(-3).map(item => ({ kind: "guardianFeedback" as const, title: "家长执行反馈", detail: text(item.content || item.freeNote), priority: 2, source: "authorized-guardian-feedback" })),
    ...(card ? [{ kind: "warningSuggestion" as const, title: text(card.title, 80), detail: text(card.tonightHomeAction), priority: 3, source: "authorized-intervention-card" }] : []),
    ...(consultation ? [{ kind: "consultationSummary" as const, title: "已有会诊结论", detail: text(consultation.summary), priority: 3, source: "authorized-consultation" }] : []),
  ].filter(item => Boolean(item.detail));
  // 固定来源而非浏览器任意 requestSource/traceId，避免刷新 nonce 绕过收费幂等。
  const payload: ParentStoryBookRequest = {
    childId, snapshot, highlightCandidates: highlights,
    storyMode: source.storyMode, generationMode: source.generationMode,
    manualTheme: text(source.manualTheme, 300), manualPrompt: text(source.manualPrompt, 2000),
    pageCount: source.pageCount, goalKeywords: (Array.isArray(source.goalKeywords) ? source.goalKeywords : []).filter(item => typeof item === "string").slice(0, 10).map(item => text(item, 80)),
    protagonistArchetype: text(source.protagonistArchetype, 100), requestSource: "server-scoped-storybook",
    stylePreset: source.stylePreset, styleMode: source.styleMode,
    customStylePrompt: text(source.customStylePrompt, 1500), customStyleNegativePrompt: text(source.customStyleNegativePrompt, 1000),
    stylePrompt: text(source.stylePrompt, 1500),
    latestInterventionCard: card ? { ...card } : null,
    latestConsultation: consultation,
  };
  const dataVersion = createHash("sha256").update(JSON.stringify({ child: snapshot.child, health, meals, growth, feedback, card, consultation })).digest("hex");
  return { payload, dataVersion };
}
