import type { AiSuggestionResponse, RuleFallbackItem } from "@/lib/ai/types";

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
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}
