import { NextResponse } from "next/server";
import { requestDashscopeWeeklyReport } from "@/lib/ai/dashscope";
import type { WeeklyReportPayload, WeeklyReportResponse, WeeklyReportSnapshot } from "@/lib/ai/types";

function isValidSnapshot(snapshot: unknown): snapshot is WeeklyReportSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  return Boolean(obj.attendance && obj.health && obj.meals && obj.growth && obj.feedback);
}

function buildFallbackWeeklyReport(snapshot: WeeklyReportSnapshot): WeeklyReportResponse {
  const risks = [
    snapshot.meals.monotonyRiskCount > 0 ? `本周有 ${snapshot.meals.monotonyRiskCount} 名幼儿存在饮食单一风险。` : "本周未出现明显的饮食单一集中风险。",
    snapshot.health.abnormalCount > 0 ? `本周累计 ${snapshot.health.abnormalCount} 次晨检异常，需要继续复盘触发场景。` : "晨检整体平稳，暂无集中异常。",
    snapshot.growth.pendingReviewCount > 0 ? `当前仍有 ${snapshot.growth.pendingReviewCount} 项待复查记录。` : "成长观察复查闭环较完整。",
  ].slice(0, 3);

  return {
    overview: `本周共覆盖 ${snapshot.childrenCount} 名幼儿，出勤率 ${snapshot.attendance.attendanceRate}% ，平均饮水 ${snapshot.meals.hydrationAvg}ml。整体运行稳定，但仍需围绕晨检异常、饮食单一和待复查事项做更细化跟进。`,
    highlights: snapshot.highlights.slice(0, 3).length > 0 ? snapshot.highlights.slice(0, 3) : ["本周基础采集数据较完整。"],
    risks,
    nextWeekFocus: [
      "优先跟进低饮水和蔬果摄入偏低的幼儿，优化下周餐单与提醒机制。",
      "将待复查事项纳入班级晨会复盘，明确责任人和复查时间点。",
      "继续推动家长反馈闭环，提高“今晚反馈”事项的次日回收率。",
    ],
    managementTip: "建议把高频关注儿童名单做成固定周会议题，减少信息遗漏。",
    source: "fallback",
    model: "weekly-rule-fallback",
  };
}

export async function POST(request: Request) {
  const configuredModel = process.env.AI_MODEL || "qwen-turbo";
  let payload: WeeklyReportPayload | null = null;

  try {
    payload = (await request.json()) as WeeklyReportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || !isValidSnapshot(payload.snapshot)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  const fallback = buildFallbackWeeklyReport(payload.snapshot);
  const aiResult = await requestDashscopeWeeklyReport(payload.snapshot);

  if (!aiResult) {
    return NextResponse.json(fallback, { status: 200 });
  }

  return NextResponse.json(
    {
      ...aiResult,
      source: "ai",
      model: configuredModel,
    } satisfies WeeklyReportResponse,
    { status: 200 }
  );
}