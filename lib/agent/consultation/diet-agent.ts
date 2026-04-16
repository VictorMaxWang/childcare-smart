import type { ConsultationFinding } from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";
import { getHydrationDisplayState } from "@/lib/hydration-display";

function takeUnique(items: Array<string | undefined>, limit = 4) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function analyzeDietConsultation(input: ConsultationInput): ConsultationFinding {
  const recentMeals = input.recentDetails?.meals ?? [];
  const lowWaterDays = recentMeals.filter((item) => item.waterMl < 120);
  const refusalMeals = recentMeals.filter((item) => item.preference === "拒食");
  const hydrationDisplay = getHydrationDisplayState(input.summary.meals.hydrationAvg);

  return {
    agentId: "diet-agent",
    title: "饮食行为 Agent",
    riskExplanation:
      input.summary.meals.hydrationAvg < 140 || input.summary.meals.monotonyDays >= 3
        ? `${input.childName} 的饮水与饮食结构已开始影响风险判断，今晚家庭动作应优先补水与降低进食对抗。`
        : `${input.childName} 的饮食行为风险暂不极端，但仍需把饮水与偏食作为联动观察项。`,
    signals: takeUnique([
      `近 7 天补水状态 ${hydrationDisplay.statusLabel}`,
      input.summary.meals.monotonyDays >= 3 ? `饮食单一 ${input.summary.meals.monotonyDays} 天` : undefined,
      refusalMeals.length > 0 ? `出现拒食记录 ${refusalMeals.length} 次` : undefined,
      lowWaterDays.length > 0 ? `需提醒补水记录 ${lowWaterDays.length} 条` : undefined,
    ]),
    actions: takeUnique([
      "今晚家庭先做一次低压力补水，避免在进食时重复追问或催促",
      "明天园内继续记录饮水主动性、进食配合度与拒食触发点",
      refusalMeals.length > 0 ? "对拒食食物保留小份暴露，不在同一餐内强行完成" : undefined,
    ]),
    observationPoints: takeUnique([
      "今晚补水是否比平时更主动",
      "是否仍对特定食物明显抗拒",
      "情绪波动是否伴随进食和饮水一起变化",
    ]),
    evidence: takeUnique([
      ...recentMeals.slice(0, 4).map((item) => `${item.date}${item.meal} ${getHydrationDisplayState(item.waterMl).recordSummary}`),
      ...recentMeals.slice(0, 2).map((item) => item.foods.join("、")),
    ]),
  };
}
