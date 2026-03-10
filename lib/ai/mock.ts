import type { AiSuggestionResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";

function riskFromSnapshot(snapshot: ChildSuggestionSnapshot): "low" | "medium" | "high" {
  const { health, meals, growth } = snapshot.summary;
  const score =
    health.abnormalCount * 2 +
    health.handMouthEyeAbnormalCount * 2 +
    growth.pendingReviewCount * 2 +
    growth.attentionCount +
    (meals.hydrationAvg < 120 ? 2 : 0) +
    (meals.balancedRate < 50 ? 2 : 0) +
    meals.allergyRiskCount;

  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

export function buildMockAiSuggestion(snapshot: ChildSuggestionSnapshot): AiSuggestionResponse {
  const riskLevel = riskFromSnapshot(snapshot);
  const { child, summary } = snapshot;
  const summaryText =
    `${child.name}近7天在饮食、成长和家园反馈上已形成连续记录，` +
    `${summary.meals.hydrationAvg < 120 ? "当前饮水偏低需要重点提醒，" : "饮水整体较稳定，"}` +
    `${summary.growth.attentionCount > 0 ? "且存在需持续跟进的成长观察项，" : "成长记录整体平稳，"}` +
    "建议围绕作息、饮水和家园协同继续做更细化的个性化跟进。";

  const highlights = [
    `${child.name}近7天共完成${summary.meals.recordCount}条膳食记录，数据连续性良好。`,
    `成长观察记录${summary.growth.recordCount}条，重点关注项${summary.growth.attentionCount}条。`,
    `家园反馈${summary.feedback.count}条，沟通链路保持畅通。`,
  ].slice(0, 3);

  const concerns = [
    summary.health.abnormalCount > 0
      ? `近7天发现${summary.health.abnormalCount}次健康异常记录，建议加强晨检复盘。`
      : "近7天未见明显健康异常，可保持当前节奏。",
    summary.meals.hydrationAvg < 120
      ? `平均饮水量约${summary.meals.hydrationAvg}ml，建议提升日间饮水提醒频次。`
      : `平均饮水量约${summary.meals.hydrationAvg}ml，处于可接受区间。`,
    summary.growth.pendingReviewCount > 0
      ? `仍有${summary.growth.pendingReviewCount}条成长记录待复查，建议本周完成闭环。`
      : "成长观察复查状态良好。",
  ].slice(0, 3);

  const actions = [
    "继续按日记录晨检、饮食、成长观察，保证数据不缺天。",
    "对需关注项在48小时内补充家园反馈，形成执行闭环。",
    "若连续出现发热或手口眼异常，请及时通知监护人并就医评估。",
  ];

  return {
    riskLevel,
    summary: summaryText,
    highlights,
    concerns,
    actions,
    actionPlan: {
      schoolActions: [
        "今天园内在晨检和午睡前后继续记录情绪、饮水和进食情况，避免遗漏关键时段。",
        "今天离园前由教师补齐需关注记录，并标注是否已有改善。",
      ],
      familyActions: [
        "今晚家庭同步反馈入睡时间、饮水和情绪状态，帮助判断园内建议是否有效。",
        "今晚若孩子对某类食物明显抗拒，可记录替代食材接受情况后再反馈。",
      ],
      reviewActions: [
        "48小时后结合新记录复盘一次，如关注项连续增加则升级为重点跟踪。",
      ],
    },
    disclaimer: "本建议由本地规则生成，仅用于托育观察与家园沟通参考，不构成医疗诊断。",
    source: "ai",
  };
}
