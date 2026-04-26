import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import WeeklyReportPreviewCard from "./WeeklyReportPreviewCard.tsx";
import type { WeeklyReportResponse } from "@/lib/ai/types";

function buildWeeklyReport(): WeeklyReportResponse {
  return {
    schemaVersion: "v2-actionized",
    role: "admin",
    summary: "本周重点是继续推进会诊闭环与复查跟进。",
    highlights: ["闭环进度整体稳定"],
    risks: ["家园沟通仍需继续跟进"],
    nextWeekActions: ["继续追踪重点儿童闭环进度"],
    trendPrediction: "stable",
    sections: [
      {
        id: "topHomeAction",
        title: "下周家庭动作",
        summary: "优先与家长确认闭环反馈。",
        items: [{ label: "动作", detail: "先联系家长确认本周回流情况" }],
      },
    ],
    primaryAction: {
      title: "继续推进闭环跟进",
      detail: "今日完成家长侧复查跟进。",
      ownerRole: "admin",
      dueWindow: "今日",
    },
    continuityNotes: ["该事项延续上周的闭环跟进"],
    memoryMeta: {
      backend: "memory",
      degraded: true,
      usedSources: ["snapshot"],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
    disclaimer: "仅供演示预览参考",
    source: "fallback",
    model: "gpt-4o-mini",
  };
}

test("WeeklyReportPreviewCard hides runtime meta in admin mode when showRuntimeMeta is false", () => {
  const html = renderToStaticMarkup(
    React.createElement(WeeklyReportPreviewCard, {
      title: "Weekly preview",
      description: "Description",
      role: "admin",
      periodLabel: "2026 W15",
      report: buildWeeklyReport(),
      ctaHref: "/admin/agent?action=weekly-report",
      ctaLabel: "Open weekly report",
      showRuntimeMeta: false,
    })
  );

  assert.ok(html.includes("Weekly preview"));
  assert.ok(!html.includes("fallback"));
  assert.ok(!html.includes("gpt-4o-mini"));
  assert.ok(!html.includes("Stable fallback"));
  assert.ok(!html.includes("仅供演示预览参考"));
});

test("WeeklyReportPreviewCard keeps runtime meta visible by default", () => {
  const html = renderToStaticMarkup(
    React.createElement(WeeklyReportPreviewCard, {
      title: "Weekly preview",
      description: "Description",
      role: "admin",
      periodLabel: "2026 W15",
      report: buildWeeklyReport(),
      ctaHref: "/admin/agent?action=weekly-report",
      ctaLabel: "Open weekly report",
    })
  );

  assert.ok(html.includes("本地兜底"));
  assert.ok(html.includes("仅供演示预览参考"));
});
