import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

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
    trendPrediction: riskLevel === "high" ? "up" : riskLevel === "medium" ? "stable" : "down",
    disclaimer: "本建议由本地规则生成，仅用于托育观察与家园沟通参考，不构成医疗诊断。",
    source: "ai",
  };
}

export function buildMockAiFollowUp(payload: AiFollowUpPayload): AiFollowUpResponse {
  const childName = payload.snapshot.child.name;
  return {
    answer:
      `针对“${payload.suggestionTitle}”，建议把关注点放到最具体的时段和动作上。` +
      `${childName} 当前已有连续7天数据，适合先做小步调整，再比较执行前后的变化。` +
      `如果你这次追问的是“${payload.question}”，最优先的是先明确今天要做什么、今晚怎么配合，以及48小时内看哪项指标。`,
    keyPoints: [
      "优先看建议对应场景是否固定出现，而不是只看单次表现。",
      "如果涉及饮水、作息或情绪，尽量记录具体时间点和持续时长。",
      "家庭反馈越具体，下一轮建议越容易个性化。",
    ],
    nextSteps: [
      "今天园内先执行一项最直接的干预动作，并留下结果记录。",
      "今晚家庭同步做一项配合动作，明早补一条反馈。",
      "48小时内对比是否较前两天更稳定，再决定是否继续加码。",
    ],
    disclaimer: "本建议由本地规则生成，仅用于托育观察与家园沟通参考，不构成医疗诊断。",
    source: "ai",
  };
}

export function buildMockWeeklyReport(snapshot: WeeklyReportSnapshot): WeeklyReportResponse {
  return {
    summary:
      `${snapshot.periodLabel}整体运营较稳定，出勤率约${snapshot.overview.attendanceRate}%，` +
      `共沉淀${snapshot.overview.mealRecordCount}条餐食记录和${snapshot.overview.feedbackCount}条家园反馈。` +
      `${snapshot.overview.pendingReviewCount > 0 ? `当前仍有${snapshot.overview.pendingReviewCount}项待复查，` : "重点事项基本完成闭环，"}` +
      "下周建议继续聚焦重点儿童的饮水、情绪和成长跟踪。",
    highlights: [
      "本周饮食、成长和反馈记录连续性较好，适合做趋势复盘。",
      `膳食均衡率约${snapshot.diet.balancedRate}%，班级整体执行情况较稳定。`,
      "家园协同链路保持畅通，适合继续推进精细化干预。",
    ],
    risks: snapshot.risks.length > 0 ? snapshot.risks.slice(0, 3) : ["少数幼儿仍存在饮水或蔬果摄入不足风险。"],
    nextWeekActions: [
      "对待复查幼儿安排固定复盘时点，避免关注项积压。",
      "继续针对低饮水和低蔬果儿童做分层提醒与家庭反馈闭环。",
      "把本周高频风险转成下周班级日常巡查清单。",
    ],
    trendPrediction:
      snapshot.overview.healthAbnormalCount > 0 || snapshot.overview.pendingReviewCount > 2 ? "up" : "stable",
    disclaimer: "本建议由本地规则生成，仅用于托育观察与家园沟通参考，不构成医疗诊断。",
    source: "ai",
  };
}
