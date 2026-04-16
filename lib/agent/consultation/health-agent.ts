import type { ConsultationFinding } from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";

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

export function analyzeHealthConsultation(input: ConsultationInput): ConsultationFinding {
  const abnormalHealth = (input.recentDetails?.health ?? []).filter((item) => item.isAbnormal);
  const latest = abnormalHealth[0] ?? input.recentDetails?.health?.[0];
  const signals = takeUnique([
    input.summary.health.abnormalCount > 0 ? `近 7 天晨检异常 ${input.summary.health.abnormalCount} 次` : undefined,
    input.summary.health.handMouthEyeAbnormalCount > 0
      ? `手口眼异常 ${input.summary.health.handMouthEyeAbnormalCount} 次`
      : undefined,
    input.summary.health.avgTemperature ? `平均体温 ${input.summary.health.avgTemperature}℃` : undefined,
    latest?.remark,
  ]);

  return {
    agentId: "health-agent",
    title: "健康观察 Agent",
    riskExplanation:
      signals.length > 0
        ? `${input.childName} 当前健康维度已出现需要连续追踪的信号，优先核对晨检异常是否仍在延续。`
        : `${input.childName} 当前未见强烈健康异常，但仍需保留晨检与情绪联动观察。`,
    signals,
    actions: takeUnique([
      "今日在晨检、午睡前各补一次状态复核，记录体温、情绪与备注变化",
      latest?.handMouthEye === "异常" ? "优先复查手口眼相关信号，并确认是否需要进一步上报" : undefined,
      "如果离园前仍有异常，需同步给家长并进入次日重点观察名单",
    ]),
    observationPoints: takeUnique([
      "体温是否继续上升或反复波动",
      "情绪是否伴随食欲、午睡状态一起变化",
      latest?.remark,
    ]),
    evidence: takeUnique([
      ...abnormalHealth.map((item) => `${item.date} ${item.mood} ${item.temperature}℃`),
      latest?.remark,
    ]),
  };
}
