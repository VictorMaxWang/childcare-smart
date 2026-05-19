import assert from "node:assert/strict";
import test from "node:test";

import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { buildAdminConsultationPriorityItems } from "./admin-consultation.ts";
import { buildAdminGovernanceDemoViewModel } from "./admin-governance-demo.ts";
import { buildAdminHomeViewModel } from "./admin-agent.ts";

const FIXED_NOW = "2026-05-07T08:00:00.000Z";

function buildHome(snapshot: ReturnType<typeof createDemoSeedSnapshot>) {
  return buildAdminHomeViewModel({
    workflow: "daily-priority",
    currentUser: {
      name: "陈园长",
      institutionName: "春芽普惠托育中心",
      institutionId: "inst-1",
      role: "admin",
    },
    visibleChildren: snapshot.children,
    attendanceRecords: snapshot.attendance,
    healthCheckRecords: snapshot.health,
    growthRecords: snapshot.growth,
    guardianFeedbacks: snapshot.feedback,
    mealRecords: snapshot.meals,
    adminBoardData: {
      highAttentionChildren: [],
      lowHydrationChildren: [],
      lowVegTrendChildren: [],
    },
    weeklyTrend: {
      balancedRate: 82,
      vegetableDays: 5,
      proteinDays: 6,
      stapleDays: 7,
      hydrationAvg: 188,
      monotonyDays: 1,
    },
    smartInsights: [],
    notificationEvents: [],
  });
}

test("admin governance demo view-model derives risk queue from existing defense fixtures", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);
  const priorityItems = buildAdminConsultationPriorityItems({
    localConsultations: snapshot.consultations,
    children: snapshot.children,
    limit: 20,
    useLocalFallback: true,
  });
  const home = buildHome(snapshot);

  const viewModel = buildAdminGovernanceDemoViewModel({
    priorityItems,
    home,
    adminSummary: null,
    weeklyReport: null,
    familyFeedbacks: snapshot.feedback,
    tasks: snapshot.tasks,
    healthMaterials: snapshot.healthMaterials,
    growthRecords: snapshot.growth,
    mealRecords: snapshot.meals,
    children: snapshot.children,
  });

  const riskNames = viewModel.riskItems.map((item) => item.childName);
  assert.ok(riskNames.includes("林小雨"));
  assert.ok(riskNames.includes("高远舟"));
  assert.ok(riskNames.includes("陈安安"));
  assert.ok(riskNames.some((name) => name.includes("班级治理")));

  assert.equal(viewModel.riskItems[0]?.priorityLabel, "P1");
  assert.ok(viewModel.riskItems.find((item) => item.childName === "林小雨")?.followUpActions.length);
  assert.ok(viewModel.riskItems.find((item) => item.childName === "高远舟")?.signal.includes("午睡"));
  assert.ok(viewModel.riskItems.find((item) => item.childName === "陈安安")?.signal.includes("进食"));
});

test("admin governance demo quality cockpit and weekly summary are non-empty", () => {
  const snapshot = createDemoSeedSnapshot(FIXED_NOW);
  const priorityItems = buildAdminConsultationPriorityItems({
    localConsultations: snapshot.consultations,
    children: snapshot.children,
    limit: 20,
    useLocalFallback: true,
  });
  const home = buildHome(snapshot);

  const viewModel = buildAdminGovernanceDemoViewModel({
    priorityItems,
    home,
    adminSummary: null,
    weeklyReport: null,
    familyFeedbacks: snapshot.feedback,
    tasks: snapshot.tasks,
    healthMaterials: snapshot.healthMaterials,
    growthRecords: snapshot.growth,
    mealRecords: snapshot.meals,
    children: snapshot.children,
  });

  assert.ok(viewModel.qualityMetrics.filter((metric) => metric.numericValue > 0).length >= 4);
  assert.ok(viewModel.trendRows.length >= 5);
  assert.ok(new Set(viewModel.trendRows.map((row) => row.risk)).size > 1);
  assert.ok(new Set(viewModel.trendRows.map((row) => row.feedback)).size > 1);
  assert.ok(new Set(viewModel.trendRows.map((row) => row.action)).size > 1);
  assert.ok(viewModel.weeklySummary.summary.length > 0);
  assert.ok(viewModel.weeklySummary.highlights.length > 0);
  assert.ok(viewModel.weeklySummary.risks.length > 0);
  assert.ok(viewModel.weeklySummary.nextWeekActions.length > 0);
  assert.ok(viewModel.reviewTasks48h.length > 0);
  assert.ok(viewModel.familyFeedbackItems.some((item) => item.childName === "林小雨"));
  assert.ok(viewModel.familyFeedbackItems.some((item) => item.childName === "陈安安"));
  assert.ok(viewModel.governanceActions.some((item) => item.title === "健康材料解析入口"));
});
