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

  return {
    riskLevel: pickRiskLevel(items),
    highlights: highlights.length > 0 ? highlights : ["今日数据已同步，可继续观察趋势变化。"],
    concerns: concerns.length > 0 ? concerns : ["暂未发现明显高风险信号，建议维持日常观察。"],
    actions:
      top.length > 0
        ? top.map((i) => i.description).filter(Boolean)
        : ["继续完成晨检、饮食与成长记录，确保每日数据完整。"],
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}
