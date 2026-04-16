import type { ParentAgentChildContext } from "@/lib/agent/parent-agent";
import type { WeeklyReportSnapshot } from "@/lib/ai/types";
import { describeAgeBandWeeklyGuidance, resolveAgeBandContext } from "@/lib/age-band/policy";
import { selectStructuredFeedbackConsumption } from "@/lib/feedback/consumption";
import type { ParentStructuredFeedbackLite } from "@/lib/feedback/types";

function uniqueTexts(items: Array<string | undefined>, limit = 4) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function getTopGrowthCategory(context: ParentAgentChildContext) {
  const categoryCounts = context.weeklyGrowthRecords.reduce<Map<string, number>>((acc, item) => {
    acc.set(item.category, (acc.get(item.category) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return Array.from(categoryCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0];
}

function buildSchoolActivityRate(context: ParentAgentChildContext) {
  const activeDates = new Set<string>();

  context.weeklyHealthChecks.forEach((item) => activeDates.add(item.date));
  context.weeklyMeals.forEach((item) => activeDates.add(item.date));
  context.weeklyGrowthRecords.forEach((item) => activeDates.add(item.createdAt.slice(0, 10)));

  if (activeDates.size === 0) return 0;
  return Math.min(100, Math.round((activeDates.size / 5) * 100));
}

function hasPositiveFeedbackState(
  feedback: ParentAgentChildContext["latestFeedback"] | ParentStructuredFeedbackLite
) {
  return (
    feedback?.improved === true ||
    feedback?.improvementStatus === "slight_improvement" ||
    feedback?.improvementStatus === "clear_improvement" ||
    feedback?.childReaction === "accepted" ||
    feedback?.childReaction === "improved"
  );
}

export function buildParentWeeklyReportSnapshot(context: ParentAgentChildContext): WeeklyReportSnapshot {
  const weeklyHealthAbnormalCount = context.weeklyHealthChecks.filter((item) => item.isAbnormal).length;
  const topGrowthCategory = getTopGrowthCategory(context);
  const attentionCount = context.attentionGrowthRecords.length + weeklyHealthAbnormalCount;
  const ageBandContext = resolveAgeBandContext({
    birthDate: context.child.birthDate,
    asOfDate: context.today,
  });
  const ageBandGuidance = describeAgeBandWeeklyGuidance(ageBandContext);
  const feedbackConsumption = selectStructuredFeedbackConsumption(
    [context.latestFeedback, context.weeklyFeedbacks],
    {
      childId: context.child.id,
      relatedTaskId: context.activeTask?.taskId,
      relatedConsultationId: context.currentInterventionCard?.consultationId,
      interventionCardId: context.currentInterventionCard?.id,
        }
  );
  const selectedFeedback = feedbackConsumption.feedback;
  const positiveFeedback = hasPositiveFeedbackState(selectedFeedback);

  const highlights = uniqueTexts(
    [
      ageBandGuidance
        ? `${ageBandGuidance.label}阶段本周先看${ageBandGuidance.focusText}这些照护变化。`
        : undefined,
      positiveFeedback ? "最近一次结构化反馈显示家庭动作已经开始起效" : undefined,
      selectedFeedback?.childReaction === "accepted" || selectedFeedback?.childReaction === "improved"
        ? `家长反馈提到孩子对家庭动作的反应更配合：${selectedFeedback.childReaction}`
        : undefined,
      feedbackConsumption.summary && positiveFeedback ? feedbackConsumption.summary : undefined,
      context.weeklyFeedbacks.length > 0 ? `本周已形成 ${context.weeklyFeedbacks.length} 次家园反馈` : undefined,
      topGrowthCategory ? `本周变化主要集中在${topGrowthCategory}` : undefined,
      context.weeklyMeals.length > 0 ? `本周已记录 ${context.weeklyMeals.length} 条饮食与补水线索` : undefined,
      context.teacherSuggestionSummary,
      ...context.smartInsights.filter((item) => item.level !== "warning").map((item) => item.title),
    ],
    5
  );

  const risks = uniqueTexts(
    [
      ...context.smartInsights.filter((item) => item.level === "warning").map((item) => item.title),
      ...context.focusReasons,
      ageBandGuidance?.cautionText,
      context.pendingReviews.length > 0 ? `仍有 ${context.pendingReviews.length} 项观察待继续跟进` : undefined,
      !positiveFeedback && feedbackConsumption.summary ? feedbackConsumption.summary : undefined,
      ...feedbackConsumption.openLoops,
      feedbackConsumption.primaryActionSupport,
    ],
    5
  );

  const continuityNotes = uniqueTexts(
    [
      ageBandGuidance ? `家长动作语气建议：${ageBandGuidance.parentActionTone}` : undefined,
      feedbackConsumption.summary,
      ...feedbackConsumption.continuitySignals,
      ...feedbackConsumption.openLoops,
      feedbackConsumption.primaryActionSupport,
    ],
    6
  );

  return {
    institutionName: context.child.className || "家园协同",
    periodLabel: "近7天",
    role: "parent",
    ageBandContext,
    overview: {
      visibleChildren: 1,
      attendanceRate: buildSchoolActivityRate(context),
      mealRecordCount: context.weeklyMeals.length,
      healthAbnormalCount: weeklyHealthAbnormalCount,
      growthAttentionCount: context.attentionGrowthRecords.length,
      pendingReviewCount: context.pendingReviews.length,
      feedbackCount: context.weeklyFeedbacks.length,
    },
    diet: {
      balancedRate: context.weeklyTrend.balancedRate,
      hydrationAvg: context.weeklyTrend.hydrationAvg,
      monotonyDays: context.weeklyTrend.monotonyDays,
      vegetableDays: context.weeklyTrend.vegetableDays,
      proteinDays: context.weeklyTrend.proteinDays,
    },
    topAttentionChildren:
      attentionCount > 0
        ? [
            {
              childName: context.child.name,
              attentionCount,
              hydrationAvg: context.weeklyTrend.hydrationAvg,
              vegetableDays: context.weeklyTrend.vegetableDays,
            },
          ]
        : [],
    highlights:
      highlights.length > 0
        ? highlights
        : ["本周已汇总园内观察与家庭反馈，适合继续把家园协同做成连续闭环。"],
    risks,
    continuityNotes: continuityNotes.length > 0 ? continuityNotes : undefined,
  };
}
