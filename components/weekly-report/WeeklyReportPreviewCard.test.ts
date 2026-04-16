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
    summary: "This week focuses on closure and follow-up.",
    highlights: ["Stable closure"],
    risks: ["Parent communication needs follow-up"],
    nextWeekActions: ["Continue tracking"],
    trendPrediction: "stable",
    sections: [
      {
        id: "topHomeAction",
        title: "Next home action",
        summary: "Call parents first.",
        items: [{ label: "Action", detail: "Parent call" }],
      },
    ],
    primaryAction: {
      title: "Keep following up",
      detail: "Complete the parent follow-up today.",
      ownerRole: "admin",
      dueWindow: "Today",
    },
    continuityNotes: ["This continues last week"],
    memoryMeta: {
      backend: "memory",
      degraded: true,
      usedSources: ["snapshot"],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
    disclaimer: "demo only",
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
  assert.ok(!html.includes("demo only"));
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

  assert.ok(html.toLowerCase().includes("fallback"));
  assert.ok(html.includes("demo only"));
});
