import assert from "node:assert/strict";
import test from "node:test";

import { isWeeklyReportResponse } from "./weekly-report-client.ts";
import type { WeeklyReportResponse } from "@/lib/ai/types";

function createWeeklyReportResponse(): WeeklyReportResponse {
  return {
    schemaVersion: "v2-actionized",
    role: "teacher",
    summary: "teacher weekly summary",
    highlights: ["records stayed consistent"],
    risks: ["pending review needs cleanup"],
    nextWeekActions: ["review abnormal checks on Monday"],
    trendPrediction: "stable",
    sections: [
      {
        id: "weeklyAnomalies",
        title: "本周异常",
        summary: "有 1 项异常需要继续观察",
        items: [{ label: "异常1", detail: "周一午睡前情绪波动明显" }],
      },
    ],
    primaryAction: {
      title: "下周第一动作",
      detail: "周一先复盘异常和待复查项",
      ownerRole: "teacher",
      dueWindow: "下周优先处理",
    },
    disclaimer: "demo boundary only",
    source: "fallback",
  };
}

test("isWeeklyReportResponse accepts the expected weekly report shape", () => {
  assert.equal(isWeeklyReportResponse(createWeeklyReportResponse()), true);
});

test("isWeeklyReportResponse rejects malformed section items", () => {
  const invalid: unknown = {
    ...createWeeklyReportResponse(),
    sections: [
      {
        id: "weeklyAnomalies",
        title: "本周异常",
        summary: "invalid item shape",
        items: [{ label: "异常1" }],
      },
    ],
  };

  assert.equal(isWeeklyReportResponse(invalid), false);
});
