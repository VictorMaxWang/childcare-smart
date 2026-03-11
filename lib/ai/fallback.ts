import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  RuleFallbackItem,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

const DEFAULT_DISCLAIMER =
  "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断；如出现持续发热或明显异常，请及时就医。";

function pickRiskLevel(items: RuleFallbackItem[]): "low" | "medium" | "high" {
  const warningCount = items.filter((i) => i.level === "warning").length;
  if (warningCount >= 2) return "high";
  if (warningCount >= 1) return "medium";
  return "low";
}

export function buildFallbackSuggestion(items: RuleFallbackItem[]): AiSuggestionResponse {
  const top = items.slice(0, 3);
  const concerns = top.filter((i) => i.level === "warning").map((i) => i.title);
  const highlights = top.filter((i) => i.level !== "warning").map((i) => i.title);
  const summaryBase = top
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 3)
    .join("；");

  return {
    riskLevel: pickRiskLevel(items),
    summary:
      summaryBase ||
      "近 7 天暂无明显高风险异常，建议继续保持晨检、饮食、成长记录与家长反馈的连续性，便于系统持续输出更贴合孩子状态的建议。",
    highlights: highlights.length > 0 ? highlights : ["今日数据已同步，可继续观察趋势变化。"],
    concerns: concerns.length > 0 ? concerns : ["暂未发现明显高风险信号，建议维持日常观察。"],
    actions:
      top.length > 0
        ? top.map((i) => i.description).filter(Boolean)
        : ["继续完成晨检、饮食与成长记录，确保每日数据完整。"],
    actionPlan: {
      schoolActions:
        top.length > 0
          ? top.slice(0, 2).map((i) => `今天园内先做：${i.description}`)
          : ["今天园内保持晨检、饮食和成长观察记录连续，及时标注异常变化。"],
      familyActions: ["今晚家庭继续反馈作息、饮食和情绪表现，帮助系统判断建议是否有效。"],
      reviewActions: ["48小时内结合新记录再次复盘，如异常持续或加重请及时联系专业人员。"],
    },
    trendPrediction: pickRiskLevel(items) === "high" ? "up" : pickRiskLevel(items) === "medium" ? "stable" : "down",
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackFollowUp(payload: AiFollowUpPayload): AiFollowUpResponse {
  const childName = payload.snapshot.child.name;
  const hydrationAvg = payload.snapshot.summary.meals.hydrationAvg;
  const pendingReviewCount = payload.snapshot.summary.growth.pendingReviewCount;

  return {
    answer:
      `关于“${payload.suggestionTitle}”，更稳妥的做法是先把它拆成可执行的小动作。` +
      `${childName} 当前${hydrationAvg < 120 ? `饮水偏低，` : "日常记录较连续，"}` +
      `${pendingReviewCount > 0 ? `且仍有${pendingReviewCount}项待复查，` : "当前重点项相对集中，"}` +
      `所以建议先从最容易当天落实的一项园内动作和一项家庭动作开始，再用48小时连续记录验证是否有效。`,
    keyPoints: [
      "先确认这条建议对应的是哪个具体场景，比如晨起、午睡前、进餐中或离园后。",
      "一次只调整一到两个变量，避免同时改太多导致无法判断是否有效。",
      "家长反馈尽量写清执行时间、孩子反应和是否比前一天改善。",
    ],
    nextSteps: [
      "今天园内先补充一次对应场景的观察记录，写明触发因素和处理结果。",
      "今晚家庭按当前建议执行一次，并记录孩子的情绪、饮水或作息变化。",
      "48小时内回看连续记录，如果仍无改善，再升级为重点跟踪事项。",
    ],
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackWeeklyReport(snapshot: WeeklyReportSnapshot): WeeklyReportResponse {
  const trendPrediction =
    snapshot.overview.healthAbnormalCount > 0 || snapshot.overview.pendingReviewCount > 2
      ? "up"
      : snapshot.diet.balancedRate >= 70 && snapshot.diet.hydrationAvg >= 150
      ? "down"
      : "stable";

  return {
    summary:
      `${snapshot.periodLabel}内共覆盖${snapshot.overview.visibleChildren}名幼儿，出勤率约${snapshot.overview.attendanceRate}%，` +
      `${snapshot.diet.balancedRate >= 70 ? "膳食结构总体较稳，" : "膳食均衡度仍需提升，"}` +
      `${snapshot.overview.pendingReviewCount > 0 ? `当前仍有${snapshot.overview.pendingReviewCount}项待复查，` : "重点事项已基本闭环，"}` +
      "建议下周继续围绕饮水、蔬果摄入和重点幼儿跟踪做精细化管理。",
    highlights:
      snapshot.highlights.length > 0
        ? snapshot.highlights.slice(0, 3)
        : ["本周核心业务数据已形成连续记录，可支持持续复盘。"],
    risks:
      snapshot.risks.length > 0
        ? snapshot.risks.slice(0, 3)
        : ["当前暂无显著集中性高风险，但仍需保持复查节奏。"],
    nextWeekActions: [
      "下周优先跟进待复查幼儿，明确到人、到时间节点。",
      "对饮水偏低和蔬果不足儿童继续做分层提醒与记录复盘。",
      "家园双方保持每日反馈，确保AI建议能基于连续数据更新。",
    ],
    trendPrediction,
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}
